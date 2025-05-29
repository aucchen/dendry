/* dendry
 * http://github.com/idmillington/dendry
 *
 * MIT License
 */
/*jshint indent:2 */
(function() {
  'use strict';

  var _ = require('lodash');
  var assert = require('assert');

  var RESERVED_PROPERTIES = {
    'id': true,
    'sections': true,
    'content': true,
    'options': true
  };

  var idReString = '[\\w-]+(?:\\.[\\w-]+)*';
  var idRe = new RegExp('^' + idReString + '$');

  var relativeIdReString = '(?:\\.+|[\\w-])[\\w-]*(?:\\.[\\w-]+)*';
  var relativeIdRe = new RegExp('^' + relativeIdReString + '$');

  var propRe = /^([A-Za-z][A-Za-z_ -]*[A-Za-z])\s*:\s*([\s\S]*)$/;
  var camelCaseRe = /^[a-z]+(?:[A-Z][a-z]+)*$/;
  var parseProperty = function(propertyString) {
    propertyString = propertyString.trim();
    var match = propRe.exec(propertyString);
    if (match) {
      var name = convertPropertyNameToCamelCase(match[1]);
      return {
        name: name,
        value: match[2]
      };
    } else {
      return null;
    }
  };

  // Convert to camel case if it is not already there.
  var convertPropertyNameToCamelCase = function(name) {
    if (!camelCaseRe.test(name)) {
      // Check if we're camel case with an initial capital
      var lcName = name.substr(0, 1).toLowerCase() + name.substr(1);
      if (camelCaseRe.test(lcName)) {
        name = lcName;
      } else {
        name = name.toLowerCase();
        name = name.replace(/[_ -]+(.)/g, function(match, letter) {
          return letter.toUpperCase();
        });
      }
    }
    return name;
  };

  var tagReString = '[\\w-]+';
  var optionReString =
    '^(#' + tagReString + '|@' + relativeIdReString + ')' + // tag or id
    '(?:\\s*:\\s*(.*))?$'; // colon and title
  var optionRe = new RegExp(optionReString);

  var parseOption = function(optionString) {
    optionString = optionString.trim();
    var match = optionRe.exec(optionString);
    if (match) {
      var obj = {
        id: match[1]
      };
      if (match[2]) {
        obj.title = match[2];
      }
      return obj;
    } else {
      return null;
    }
  };

  var filenameRe = /^([\w-]+?(\.[\w-]+?)*?)(\.([\w-]+?))?\.([^.]*)$/;
  var parseFilename = function(filename) {
    var fileSeparator = process.platform === 'win32' ? '\\' : '/';
    var basename = filename.substr(filename.lastIndexOf(fileSeparator) + 1);
    var match = filenameRe.exec(basename);
    if (match) {
      var obj = {
        id: match[1],
        $metadata: {
          $file: filename,
          id: {$line: -1}
        }
      };
      if (match[4]) {
        obj.type = match[4];
        obj.$metadata.type = {$line: -1};
      }
      return obj;
    } else {
      return null;
    }
  };

  // Parses the given content, extracted from the given file.
  var parseFromContent = function(filename, content, callback) {
    // Magic is embedded scripting. This determines if the line ends still
    // inside the magic block.
    var endsInMagic = function(startsInMagic, thisLine) {
      var lastStart = thisLine.lastIndexOf('{!');
      var lastEnd = thisLine.lastIndexOf('!}');
      if (lastEnd > lastStart) {
        return false;
      } else if (lastStart > lastEnd) {
        return true;
      } else {
        // They are only equal if they are both -1
        return startsInMagic;
      }
    };

    // For properties and links, we can have follow on lines, this
    // checks and advances the current line, returning the accumulated
    // data.
    var gobbleFollowOnLines = function() {
      var content;
      var inMagic = false;

      var indentRe = /^\s+\S/;

      // Test the initial content for magic.
      inMagic = endsInMagic(false, line);
      content = [inMagic ? (line + '\n') : line];

      // Gobble lines.
      for (var j = i + 1; j <= lines.length; ++j) {
        var thisLine = lines[j - 1];
        if (!inMagic) {
          // No indent at the start means we're done.
          if (!indentRe.test(thisLine)) {
            break;
          }
        }

        // Update whether we're in magic or not.
        var startedInMagic = inMagic;
        inMagic = endsInMagic(inMagic, thisLine);

        // We have a continuation line, trim it down unless it is magic.
        i = j;
        if (!startedInMagic) {
          thisLine = ' ' + thisLine.trim();
        } else {
          // Always trim the end, ending whitespace is never significant.
          thisLine = thisLine.replace(/\s*$/, '');
        }
        if (inMagic) {
          thisLine = thisLine + '\n';
        }
        content.push(thisLine);
      }

      line = content.join('');
    };

    // Handles an error, adding line number.
    var error = function(message) {
      var fullMessage;
      if (i) {
        fullMessage = filename + ' line ' + i.toString() + ': ' + message;
      } else {
        fullMessage = message;
      }
      var error = new Error(fullMessage);
      error.line = i;
      callback(error);
    };

    var validateId = function(text) {
      if (!idRe.test(text)) {
        error(
          'Malformed id "' + text + '" (use letters, numbers, _ and - only).'
          );
        return false;
      }
      return true;
    };

    // Validate a property, returns null if the property is invalid
    // and an error was raised.
    var parseAndValidateProperty = function(text, whatami) {
      var property = parseProperty(text);
      if (property !== null) {
        if (RESERVED_PROPERTIES[property.name]) {
          return error('Property "' + property.name + '" is a reserved name.');
        } else {
          return property;
        }
      } else {
        return error('Invalid ' + whatami + ' definition.');
      }
    };

    var finishCurrentSection = function() {
      currentSection.content = contentLines.join('\n');
    };

    // Blank lines are used as the primary transitions between content chunks.
    var handleBlankLine = function() {
      switch (context) {
      case 'content':
        context = 'blank-content';
        break;
      case 'properties':
        context = 'first-content';
        break;
      case 'options':
        // Transitions into no-context, we can have no more content.
        context = null;
        break;
      case null:
        // We're after any content, so ignore any blank lines.
        break;
      }
      return true;
    };

    // Lines beginning with '@' introduce a new section.
    var createNewSection = function() {
      if (result.sections === undefined) {
        result.sections = [];
      }
      finishCurrentSection();

      var id = line.substr(1).trim();
      if (!validateId(id)) {
        return false;
      }

      // Check for id reuse.
      if (id === result.id) {
        error('Section can\'t use the file id "' + id + '".');
        return false;
      }
      if (sectionIds[id] !== undefined) {
        error('Section with id "' + id + '" already defined.');
        return false;
      } else {
        sectionIds[id] = true;
      }

      // Combine with the file id
      id = [result.id, id].join('.');

      // Create a new section and register it.
      currentSection = {
        id: id,
        $metadata: {
          $file: filename,
          $line: i
        }
      };
      contentLines = [];
      optionIds = {};
      result.sections.push(currentSection);

      context = 'properties';
      return true;
    };

    var beginOptionsBlock = function() {
      context = 'options';
      currentSection.options = [];
      return true;
    };

    var handlePropertyLine = function() {
      gobbleFollowOnLines();
      var property = parseAndValidateProperty(line, 'property');
      if (property !== undefined) {
        if (currentSection[property.name] !== undefined) {
          error('Property "' + property.name + '" is already defined.');
          return false;
        } else {
          currentSection.$metadata[property.name] = {
            $file: filename,
            $line: i
          };
          currentSection[property.name] = property.value;
          return true;
        }
      } else {
        // Error has been raised, just exit.
        return false;
      }
    };

    var handleOptionLine = function() {
      gobbleFollowOnLines();
      if (line.substr(0, 1) !== '-') {
        error('Hyphens are required in an option block.');
        return false;
      }

      var lineTrimmed = line.substr(1).trim();
      var options = currentSection.options;
      var option = parseOption(lineTrimmed);
      if (option !== null) {
        // Check for redefinitions.
        if (optionIds[option.id] !== undefined) {
          error('Option with id/tag "' + option.id + '" already specified.');
          return false;
        } else {
          optionIds[option.id] = true;
        }
        option.$metadata = {
          $file: filename,
          $line: i
        };
        options.push(option);
      } else {
        // See if we can interpret it as a property.
        var property = parseAndValidateProperty(line.substr(1).trim(),
                                                'property or option',
                                                option);
        if (property !== undefined) {
          if (options.length === 0) {
            error('Property found in options before an option is defined.');
            return false;
          }

          option = options[options.length - 1];
          if (option[property.name] !== undefined) {
            return error(
              'Property "' + property.name + '" is already defined.'
              );
          }
          option[property.name] = property.value;
          option.$metadata[property.name] = {$file:filename, $line:i};
        } else {
          // Error has been raised, just exit.
          return false;
        }
      }
      return true;
    };

    // ......................................................................
    // Parsing algorithm.
    var i;
    var line;
    var lines = content.split(/\n/);
    var context = 'properties';
    var contentLines = [];
    var sectionIds = {};
    var optionIds = {};
    var result = parseFilename(filename);
    if (!result) {
      return error('Cannot extract id or type from filename.');
    }
    var currentSection = result;

    // Interpret lines in sequence.
    for (i = 1; i <= lines.length; ++i) {
      line = lines[i - 1];

      // Ignore comments.
      if (line.substring(0, 1) === '#') {
        continue;
      }

      // A blank line transitions between chunk types
      if (line.trim().length === 0) {
        assert.ok(handleBlankLine());
        continue;
      }

      // If we have an id, then create a new section.
      if (line.substring(0, 1) === '@') {
        if (!createNewSection()) {
          return;
        }
        continue;
      }

      // Hyphens separated by content by a blank link begin options.
      if (line.substr(0, 1) === '-' &&
          line.substr(1, 1) !== '-' &&
          (context === 'blank-content' || context === 'first-content')) {
        assert.ok(beginOptionsBlock());
      }

      // Otherwise deal with the appropriate content.
      switch (context) {
      case null:
        return error('Found content after an options block.');

      case 'blank-content':
        contentLines.push('');
        /* falls through */
      case 'first-content':
      case 'content':
        contentLines.push(line);
        context = 'content';
        break;

      case 'properties':
        if (!handlePropertyLine()) {
          return;
        }
        break;

      case 'options':
        if (!handleOptionLine()) {
          return;
        }
        break;
      }
    }

    finishCurrentSection();
    return callback(null, result);
  };

  // ======================================================================

  var removeMetadataFromArray = function(array) {
    for (var i = 0; i < array.length; ++i) {
      var object = array[i];
      if (_.isObject(object)) {
        removeMetadataFromObject(object);
      }
    }
  };

  var removeMetadataFromObject = function(object) {
    for (var key in object) {
      if (key === '$metadata') {
        delete object.$metadata;
      }
      var value = object[key];
      if (_.isArray(value)) {
        removeMetadataFromArray(value);
      }
    }
  };

  // Accessors for property values, which cope with raw property
  // values, or with augmented values containing a line number.
  var propertyErrorMessage = function(object, propertyName, msg) {
    var fal = propertyFileAndLine(object, propertyName);
    if (fal) {
      msg = fal + ': ' + msg;
    }
    return msg;
  };

  var propertyFileAndLine = function(object, propertyName, requireBoth) {
    var metadata = object.$metadata;
    if (metadata !== undefined) {
      var file = metadata.$file;
      var line = metadata.$line;
      var prop = metadata[propertyName];
      if (prop !== undefined) {
        file = prop.$file || file;
        line = prop.$line || line;
      }
      var bits = [];
      if (file) {
        bits.push(file);
      }
      if (line !== undefined) {
        if (line < 0) {
          bits.push('filename');
        } else {
          bits.push('line ' + line);
        }
      }
      if (bits.length > 1 || (bits.length > 0 && !requireBoth)) {
        return bits.join(' ');
      }
    }
    return null;
  };

  module.exports = {
    parseFromContent: parseFromContent,

    regexes: {
      id: idRe, idString: idReString,
      relativeId: relativeIdRe, relativeIdString: relativeIdReString
    },

    propertyFileAndLine: propertyFileAndLine,
    propertyErrorMessage: propertyErrorMessage,
    removeMetadataFromObject: removeMetadataFromObject,
    removeMetadataFromArray: removeMetadataFromArray,

    convertPropertyNameToCamelCase: convertPropertyNameToCamelCase
  };

}());
