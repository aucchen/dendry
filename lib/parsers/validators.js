/* dendry
 * http://github.com/idmillington/dendry
 *
 * MIT License
 */
/*jshint indent:2 */
(function() {
  'use strict';

  var async = require('async');
  var assert = require('assert');
  var _ = require('lodash');

  var engine = require('../engine');
  var dryParser = require('./dry');
  var logic = require('./logic');
  var content = require('./content');
  var qdcontent = require('./qdcontent');

  // Common error reporting and property value extraction functions.

  var properr = function(object, propertyName, msg) {
    msg = dryParser.propertyErrorMessage(object, propertyName, msg);
    return new Error(msg);
  };

  var propval = function(object, propertyName) {
    if (propertyName) {
      return object[propertyName];
    } else {
      return object;
    }
  };

  // ------------------------------------------------------------------------
  // Basic Types
  // ------------------------------------------------------------------------

  // If the property is valid, calls back with an integer.
  var validateBoolean = function(object, propertyName, callback) {
    assert(callback !== undefined, 'Callback required (wrong number of args?)');
    var val = propval(object, propertyName);
    var name = val.trim().toLowerCase();
    if (/^(yes|true|t|y|ok)$/.test(name)) {
      return callback(null, true);
    } else if (/^(no|false|f|n)$/.test(name)) {
      return callback(null, false);
    } else {
      var integer = parseInt(name);
      if (!isNaN(integer)) {
        return callback(null, !!integer);
      } else {
        var err = properr(
          object, propertyName, '"' + val + '" is not a valid yes/no value.'
          );
        return callback(err);
      }
    }
  };

  // If the property is valid, calls back with an integer.
  var validateInteger = function(object, propertyName, callback) {
    assert(callback !== undefined, 'Callback required (wrong number of args?)');
    var val = propval(object, propertyName);
    var integer = parseInt(val);
    if (isNaN(integer)) {
      var err = properr(
        object, propertyName, '"' + val + '" is not a valid whole number.'
        );
      return callback(err);
    } else {
      return callback(null, integer);
    }
  };

  // If the property is valid, calls back with a float.
  var validateFloat = function(object, propertyName, callback) {
    assert(callback !== undefined, 'Callback required (wrong number of args?)');
    var val = propval(object, propertyName);
    var integer = parseFloat(val);
    if (isNaN(integer)) {
      var err = properr(
        object, propertyName, '"' + val + '" is not a valid number.'
        );
      return callback(err);
    } else {
      return callback(null, integer);
    }
  };

  var validateQualityValue = function(object, propertyName, callback) {
    assert(callback !== undefined, 'Callback required (wrong number of args?)');
    var val = propval(object, propertyName);
    if(!isNaN(Number(val))){
      return callback(null, parseFloat(val));
    }else if(["true", "TRUE","false","FALSE"].includes(val)){
      return callback(null, val.toLowerCase() === "true");
    }else{
      return callback(null, val);
    }
  };

  // Generator to make tests to convert properties to a number (by
  // default an integer) and check they are in bounds.
  var makeEnsureInRange = function(min, max, numericValidator) {
    numericValidator = numericValidator || validateInteger;
    return function(object, propertyName, callback) {
      numericValidator(object, propertyName, function(err, val) {
        if (err) {
          return callback(err);
        }
        if ((min !== undefined && val < min) ||
            (max !== undefined && val > max)) {
          if (min !== undefined) {
            if (max !== undefined) {
              err = properr(
                object, propertyName,
                '' + val + ' is not in range ' + min + '-' + max + '.'
                );
            } else {
              err = properr(
                object, propertyName,
                '' + val + ' is not in range ' + min + '+.'
                );
            }
          } else {
            err = properr(
              object, propertyName,
              '' + val + ' is not in range -' + max + '.'
              );
          }
          return callback(err);
        }
        return callback(null, val);
      });
    };
  };

  // If the property is valid, calls back with an id.
  var validateId = function(object, propertyName, callback) {
    assert(callback !== undefined, 'Callback required (wrong number of args?)');
    var val = propval(object, propertyName);
    val = val.trim();
    if (val.substr(0, 1) === '@') {
      val = val.substr(1);
    }
    if (dryParser.regexes.id.test(val)) {
      return callback(null, val);
    } else {
      var err = properr(
        object, propertyName,
        '"' + val + '" is not a valid id.'
        );
      return callback(err);
    }
  };

  // If the property is valid, calls back with a relative id.
  var validateRelativeId = function(object, propertyName, callback) {
    assert(callback !== undefined, 'Callback required (wrong number of args?)');
    var val = propval(object, propertyName);
    val = val.trim();
    if (val.substr(0, 1) === '@') {
      val = val.substr(1);
    }
    if (dryParser.regexes.relativeId.test(val)) {
      return callback(null, val);
    } else {
      var err = properr(
        object, propertyName,
        '"' + val + '" is not a valid relative id.'
        );
      return callback(err);
    }
  };

  var validateQualityName = function(object, propertyName, callback) {
    assert(callback !== undefined, 'Callback required (wrong number of args?)');
    var val = propval(object, propertyName);
    val = val.trim();
    if (/^[a-zA-Z][\-a-zA-Z0-9_]*$/.test(val)) {
      return callback(null, val);
    } else {
      var err = properr(
        object, propertyName,
        '"' + val + '" is not a valid quality name.'
        );
      return callback(err);
    }
  };

  // TODO: validateQualityList?

  // Generator to wrap one of the above id or name validators, and
  // exclude certain values.
  var makeExcludeIdOrName = function(what, validator, exclude) {
    return function(object, propertyName, callback) {
      validator(object, propertyName, function(err, name) {
        if (err) {
          return callback(err);
        }   else {
          for (var i = 0; i < exclude.length; ++i) {
            if (exclude[i] === name) {
              err = properr(
                object, propertyName,
                '"' + name + '" is a reserved ' + what + '.'
                );
              return callback(err);
            }
          }
          return callback(null, name);
        }
      });
    };
  };

  // Generator to make tests to check if a property is equal to a given value.
  var makeEnsureEqualTo = function(what, value) {
    value = value.trim();
    return function(object, propertyName, callback) {
      assert(
        callback !== undefined, 'Callback required (wrong number of args?)'
        );
      var val = propval(object, propertyName);
      val = val.trim();
      if (val === value) {
        return callback(null, value);
      } else {
        var err = properr(
          object, propertyName,
          what + ' must equal "' + value + '", "' + val + '" found instead.'
          );
        return callback(err);
      }
    };
  };

  // If the property is valid, calls back with a list of tags, stripped of
  // any leading hash symbols. Tags can be whitespace, comma or semicolon
  // separated.
  var tagSeparatorRe = /[\s;,]+/;
  var tagRe = /^#?([0-9a-zA-z_-]+)$/;
  var validateTagList = function(object, propertyName, callback) {
    assert(callback !== undefined, 'Callback required (wrong number of args?)');
    var val = propval(object, propertyName);
    var tags = val.split(tagSeparatorRe);
    var result = [];
    for (var i = 0; i < tags.length; ++i) {
      var tag = tags[i].trim();
      if (!tag) {
        continue;
      }

      var match = tagRe.exec(tag);
      if (!match) {
        var err = properr(
          object, propertyName,
          'Tag ' + (i + 1) + ' "' + tag + '" is not valid.'
          );
        return callback(err);
      } else {
        result.push(match[1]);
      }
    }
    return callback(null, result);
  };

  // ------------------------------------------------------------------------
  // Magic and Logic
  // ------------------------------------------------------------------------

  var makeCompile = function(description, logicMethod) {
    // Makes sure that the property contains instructions to generate a
    // true/false value, either from Magic (javascript code) or an
    // expression in Logic.
    return function(object, propertyName, callback) {
      var err;
      assert(callback !== undefined,
             'Callback required (wrong number of args?)');
      var val = propval(object, propertyName).trim();

      // Check for Magic
      var magicStart = val.search('{!');
      var magicEnd = val.search('!}');
      if (magicStart > -1 || magicEnd > -1) {
        // The content contains magic, check it contains nothing else.
        if (magicStart > 0 || magicEnd < val.length - 2) {
          err = properr(
            object, propertyName,
            'Magic in ' + description +
            ' must have no other content surrounding it.'
          );
          return callback(err);
        } else {
          var magic = val.slice(2, -2);
          try {
            var fn = engine.makeFunctionFromSource(magic);
            return callback(null, fn);
          } catch (evalErr) {
            err = properr(object, propertyName, evalErr.message);
            return callback(err);
          }
        }
      } else {
        logicMethod(val, function(err, fn) {
          if (err) {
            err = properr(object, propertyName, err.message);
            return callback(err);
          }
          return callback(null, fn);
        });
      }
    };
  };

  var validatePredicate = makeCompile('a predicate', logic.compilePredicate);

  var validateExpression =
    makeCompile('an expression', logic.compileExpression);

  // Makes sure that the property contains a series of chunks of
  // functionality, either in Magic or Logic. Sends back an array of
  // actions if validation succeeds.
  var validateActions = function(object, propertyName, callback) {
    var i;
    var err;
    assert(callback !== undefined, 'Callback required (wrong number of args?)');
    var val = propval(object, propertyName).trim();

    // Split up value into chunks by the boundary characters of magic.
    var magicRe = /\{\!([\s\S]*?)\!\}/g;
    var chunks = [];
    var candidateChunks = val.split(magicRe);
    for (i = 0; i < candidateChunks.length; ++i) {
      var candidateChunk = candidateChunks[i].trim();
      if (candidateChunk.length > 0) {
        chunks.push({
          type: (i % 2 === 0) ? 'logic' : 'magic',
          source: candidateChunk
        });
      }
    }

    // Validate and convert each chunk.
    var actions = [];
    i = -1;
    var hasError = false;
    var error = null;
    for (const chunk of chunks) {
      ++i;
      if (chunk.type === 'magic') {
        // Parse this as Magic.
        try {
          let fn = engine.makeFunctionFromSource(chunk.source);
          actions.push(fn);
        } catch (evalErr) {
          err = properr(
            object, propertyName,
            evalErr.message + ' in chunk ' + (i + 1) + '.'
            );
          hasError = true;
          error = err;
        }
      } else {
        // Parse this as Logic.
        logic.compileActions(chunk.source, function(err, fn) {
          if (err) {
            hasError = true;
            error = properr(object, propertyName, err.message);
          } else {
            actions.push(fn);
          }
        });
      }
    }
    if (hasError) {
      return callback(error);
    } else {
      return callback(null, actions);
    }
  };

  // ------------------------------------------------------------------------
  // Schemata
  // ------------------------------------------------------------------------

  var makeEnsureObjectMatchesSchema = function(schema) {
    return function(parent, propertyName, callback) {
      assert(
        callback !== undefined, 'Callback required (wrong number of args?)'
        );
      var object = propval(parent, propertyName);

      // Find list of properties in the dry. We'll remove these as we process
      // them, leaving just 'extras' we have no schema for.
      var props = {};
      _.forIn(object, function(field, name) {
        if (name.substr(0, 1) !== '$') {
          props[name] = true;
        }
      });

      // Go through the properties in the schema.
      async.each(_.keys(schema), function(name, itcallback) {
        //console.log('makeEnsureObjectMatchesSchema async.each', name);
        if (name === '$clean') {
          return itcallback();
        }

        var propSchema = schema[name];
        var valueInObject = object[name];
        var err;

        // Remove this name if we've got it.
        delete props[name];

        // Ensure we have required values.
        if (valueInObject === undefined) {
          if (propSchema.required) {
            err = properr(
              object, name,
              'Required property "' + name + '" missing.'
              );
            return itcallback(err);
          }
          return itcallback();
        }

        // Validate and parse values
        var validate = propSchema.validate;
        if (!validate) {
          // Remove names that we should trim.
          if (propSchema.remove) {
            delete object[name];
          }

          return itcallback();
        } else {
          // We have a validation function.
          validate(object, name, function(err, value) {
            if (err) {
              return itcallback(err);
            }

            // Remove names that we should trim (NB: after validation).
            if (propSchema.remove) {
              delete object[name];
            } else {
              // Use the validated value.
              object[name] = value;
            }

            return itcallback();
          });
        }

      }, function(err) {
        if (err) {
          return callback(err);
        }

        // Anything left in the defined properties, are extras and not allowed.
        var extras = _.keys(props);
        if (extras.length > 0) {
          var extrasQuoted = _.map(extras, function(name) {
            var fal = dryParser.propertyFileAndLine(object, name, true);
            if (fal) {
              return '"' + name + '" (' + fal + ')';
            } else {
              return '"' + name + '"';
            }
          });
          err = properr(
            object, null,
            'Unknown properties: ' + extrasQuoted.join(', ') + '.'
            );
          return callback(err);
        }

        // Run the top-level cleaning/checking functions.
        if (schema.$clean !== undefined) {
          schema.$clean(object, function(err, result) {
            if (err) {
              err = properr(object, null, err.message);
              return callback(err);
            } else {
              return callback(null, result);
            }
          });
        } else {
          return callback(null, object);
        }
      });
    };
  };

  var makeEnsureListItemsMatchSchema = function(schema) {
    var ensureItem = makeEnsureObjectMatchesSchema(schema);
    return function(parent, propertyName, callback) {
      assert(
        callback !== undefined, 'Callback required (wrong number of args?)'
        );
      var list = propval(parent, propertyName);

      var result = [];
      async.each(list, function(item, done) {
        ensureItem(item, null, function(err, resultItem) {
          if (err) {
            return done(err);
          }
          result.push(resultItem);
          return done();
        });
      }, function(err) {
        if (err) {
          callback(err);
        } else {
          callback(null, result);
        }
      });
    };
  };

  // For each item in the list, its id is used to look up a schema in the
  // given schemae object. That schema is then used to validate the item.
  // If the id doesn't match a schema, then the $default schema is used, if
  // no default is available, an error is raised.
  var makeEnsureListItemsMatchSchemaById = function(schemae) {
    return function(parent, propertyName, callback) {
      assert(
        callback !== undefined, 'Callback required (wrong number of args?)'
        );
      var list = propval(parent, propertyName);

      var result = [];
      async.each(list, function(item, done) {
        var listItem = item;
        var id = listItem.id;
        var schema = schemae[id];
        if (schema === undefined) {
          schema = schemae.$default;
        }
        if (schema === undefined) { // If schema is still undefined.
          var err = properr(
            item, 'id',
            'Found an item with an unknown id "' + id + '".'
            );
          return done(err);
        }
        var ensureItem = makeEnsureObjectMatchesSchema(schema);
        ensureItem(item, null, function(err, resultItem) {
          if (err) {
            return done(err);
          }
          result.push(resultItem);
          return done();
        });
      }, function(err) {
        if (err) {
          callback(err);
        } else {
          callback(null, result);
        }
      });
    };
  };

  // ------------------------------------------------------------------------
  // Rich content
  // ------------------------------------------------------------------------

  var validateParagraphContent = function(object, propertyName, callback) {
    assert(callback !== undefined, 'Callback required (wrong number of args?)');
    var val = propval(object, propertyName);
    content.compile(val, true, callback);
  };

  var validateLineContent = function(object, propertyName, callback) {
    assert(callback !== undefined, 'Callback required (wrong number of args?)');
    var val = propval(object, propertyName);
    content.compile(val, false, callback);
  };

  // ------------------------------------------------------------------------
  // QDisplay content
  // ------------------------------------------------------------------------
  var validateQDisplayContent = function(object, propertyName, callback) {
    assert(callback !== undefined, 'Callback required (wrong number of args?)');
    var val = propval(object, propertyName);
    qdcontent.compile(val, callback);
  };

  // ------------------------------------------------------------------------
  // Specific property types
  // ------------------------------------------------------------------------

  var _frequencyFloatValidator = makeEnsureInRange(0, undefined, validateFloat);
  var validateFrequency = function(object, propertyName, callback) {
    assert(callback !== undefined, 'Callback required (wrong number of args?)');
    var val = propval(object, propertyName);
    var name = val.trim().toLowerCase();
    if (/^(always|\*)$/.test(name)) {
      return callback(null, null);
    } else if (/^(never)$/.test(name)) {
      return callback(null, 0);
    } else {
      return _frequencyFloatValidator(object, propertyName, callback);
    }
  };

  var _endsInMagic = function(startsInMagic, chunk) {
    var lastStart = chunk.lastIndexOf('{!');
    var lastEnd = chunk.lastIndexOf('!}');
    if (lastEnd > lastStart) {
      return false;
    } else if (lastStart > lastEnd) {
      return true;
    } else {
      // They are only equal if neither was found.
      return startsInMagic;
    }
  };

  // GoTo properties take zero or more relative ids followed by
  // if-clauses with predicates, optionally concluded by a relative id
  // without and if-clause. Each of these are separated by
  // semi-colons.
  var validateGoTo = function(object, propertyName, callback) {
    assert(callback !== undefined, 'Callback required (wrong number of args?)');
    var val = propval(object, propertyName);

    // Separate the value by semi-colons. Semi-colons are common in
    // magic, so we'll have to weld chunks back together if they are
    // mid-magic.
    var naiveChunks = val.split(/\s*;\s*/);
    var chunks = [];
    var inMagic = false;
    _.each(naiveChunks, function(chunk) {
      if (inMagic) {
        chunks[chunks.length - 1] = chunks[chunks.length - 1] + ';' + chunk;
      } else {
        chunks.push(chunk);
      }
      inMagic = _endsInMagic(inMagic, chunk);
    });
    // Not an error because dry parsing should have excluded this.
    assert(!inMagic);

    // For each clause, split by the first if and validate each bit.
    var result = [];
    var hasError = false;
    var error = null;
    for (const chunk of chunks) {
      var parts = chunk.split(/\s+if\s+/, 2);
      validateRelativeId(parts[0], null, function(err, relativeId) {
        if (err) {
          hasError = true;
          error = properr(object, null, err.message);
        }
        if (parts.length === 2) {
          validatePredicate(parts[1], null, function(err, predicate) {
            if (err) {
              hasError = true;
              error = properr(object, null, err.message);
            }
            result.push({id: relativeId, predicate:predicate});
          });
        } else {
          result.push({id: relativeId});
        }
      });
    }
    if (hasError) {
      return callback(error);
    } return callback(null, result);
  };

  // GoToRef properties take zero or more quality names
  // (which should refer to strings containing absolute scene IDs) followed by
  // if-clauses with predicates, optionally concluded by a variable
  // without an if-clause. Each of these are separated by
  // semi-colons.
  var validateGoToRef = function(object, propertyName, callback) {
    assert(callback !== undefined, 'Callback required (wrong number of args?)');
    var val = propval(object, propertyName);

    // Separate the value by semi-colons. Semi-colons are common in
    // magic, so we'll have to weld chunks back together if they are
    // mid-magic.
    var naiveChunks = val.split(/\s*;\s*/);
    var chunks = [];
    var inMagic = false;
    _.each(naiveChunks, function(chunk) {
      if (inMagic) {
        chunks[chunks.length - 1] = chunks[chunks.length - 1] + ';' + chunk;
      } else {
        chunks.push(chunk);
      }
      inMagic = _endsInMagic(inMagic, chunk);
    });
    // Not an error because dry parsing should have excluded this.
    assert(!inMagic);

    // For each clause, split by the first if and validate each bit.
    var result = [];
    var hasError = false;
    var error = null;
    for (const chunk of chunks) {
      var parts = chunk.split(/\s+if\s+/, 2);
      // go to a quality
      validateQualityName(parts[0], null, function(err, quality) {
        if (err) {
          hasError = true;
          error = properr(object, null, err.message);
        }
        if (parts.length === 2) {
          validatePredicate(parts[1], null, function(err, predicate) {
            if (err) {
              hasError = true;
              error = properr(object, null, err.message);
            }
            result.push({id: quality, predicate:predicate});
          });
        } else {
          result.push({id: quality});
        }
      });
    }
    if (hasError) {
      return callback(error);
    }
    return callback(null, result);
  };

  var validateSprites = function(object, propertyName, callback) {
      var val = propval(object, propertyName);
      // list of location_on_page: image_path,
      // location_on_page could be topLeft, topRight, bottomLeft, bottomRight
      // or just let it be any string.
      var result = [];
      try {
          if (val.toLowerCase() == 'none') {
              return callback(null, val.toLowerCase());
          }
          var parts = val.split(/,/);
          for (var i = 0; i < parts.length; i++) {
              parts[i] = parts[i].trim();
              var inner_parts = parts[i].split(/:/);
              var loc = inner_parts[0].trim();
              var path = inner_parts[1].trim();
              result.push([loc, path]);
          }
          // split val on commas.
      } catch(err) {
          return callback(err);
      }
      return callback(null, result);
  };

  var validateSpriteStyles = function(object, propertyName, callback) {
      var val = propval(object, propertyName);
      // TODO: list of location_on_page: style,
      // location_on_page could be topLeft, topRight, bottomLeft, bottomRight
      // or just let it be any string.
      // TODO: this doesn't work bc it can't figure out the splits.
      var result = [];
      try {
          var parts = val.split(/"\s*,\s*"/);
          for (var i = 0; i < parts.length; i++) {
              parts[i] = parts[i].trim();
              var inner_parts = parts[i].split(/:/);
              var loc = inner_parts[0].trim();
              var style = inner_parts[1].trim();
              result.push([loc, style]);
          }
          // split val on commas.
      } catch(err) {
          return callback(err);
      }
      return callback(null, result);
  };
  // ------------------------------------------------------------------------

  module.exports = {
    validateId: validateId,
    validateQualityName: validateQualityName,
    validateBoolean: validateBoolean,
    validateRelativeId: validateRelativeId,
    validateInteger: validateInteger,
    validateFloat: validateFloat,
    validateQualityValue: validateQualityValue,
    makeEnsureInRange: makeEnsureInRange,
    makeEnsureEqualTo: makeEnsureEqualTo,
    makeExcludeIdOrName: makeExcludeIdOrName,
    validateTagList: validateTagList,

    validateExpression: validateExpression,
    validatePredicate: validatePredicate,
    validateActions: validateActions,

    makeEnsureObjectMatchesSchema: makeEnsureObjectMatchesSchema,
    makeEnsureListItemsMatchSchema: makeEnsureListItemsMatchSchema,
    makeEnsureListItemsMatchSchemaById: makeEnsureListItemsMatchSchemaById,

    validateQDisplayContent: validateQDisplayContent,
    validateParagraphContent: validateParagraphContent,
    validateLineContent: validateLineContent,
    validateGoTo: validateGoTo,
    validateGoToRef: validateGoToRef,
    validateFrequency: validateFrequency,

    validateSprites: validateSprites
  };
}());
