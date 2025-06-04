/* dendry
 * http://github.com/idmillington/dendry
 *
 * MIT License
 */
/*jshint indent:2 */
(function() {
  'use strict';

  var _repeat = function(str, times) {
    if (times < 1) return '';
    if (times % 2 !== 0) return str + _repeat(str, times - 1);
    var half = _repeat(str, times / 2);
    return half + half;
  }

  var _indent = function(spaces, text) {
    return _repeat(' ', spaces) + text;
  }

  var _objToText = function(obj) {
    if (obj.type == null) {
      return obj;
    } else {
      switch (obj.type) {
      case 'emphasis-1':
          return '*' + _lineToText(obj.content) + '*';
      case 'emphasis-2':
          return '**' + _lineToText(obj.content) + '**';
      case 'hidden':
        return _lineToText(obj.content);
      case 'line-break':
        return '\n';

      // We can't handle elements that require state-dependency.
      case 'insert':
      case 'conditional':
        throw new Error(
          obj.type + ' should have been evaluated by now.'
          );
      }
    }
  };

  var _lineToText = function(content) {
    var output;
    if (Array.isArray(content)) {
      output = content.map(_objToText).join('')
    } else {
      output = _objToText(content);
    }
    return output.replace(/ +/g, ' ').replace(/ *\n */g, '\n');
  };

  var _paragraphsToText = function(paragraphs) {
    var text;
    var result = [];
    for (var i = 0; i < paragraphs.length; ++i) {
      var paragraph = paragraphs[i];
      switch (paragraph.type) {
      case 'heading':
        text = _lineToText(paragraph.content).trim();
        result.push('\n' + text);
        result.push(_repeat('-', text.length) + '\n');
        break;
      case 'paragraph':
        text = _lineToText(paragraph.content);
        if (text !== '')
        result.push(text.trim() + '\n');
        break;
      case 'quotation':
        text = _lineToText(paragraph.content);
        result.push(
          _indent(4, text.trim()) +
          ((i === paragraphs.length - 1 ||
           paragraphs[i + 1].type !== 'attribution') ? '\n' : '')
        );
        break;
      case 'attribution':
        text = _lineToText(paragraph.content);
        result.push(_indent(8, text.trim()) + '\n');
        break;
      case 'hrule':
        result.push('-----\n');
        break;
      }
    }
    return result.join('\n');
  };

  var _logParagraphs = function(paragraphs, log) {
    var text = _paragraphsToText(paragraphs).trimEnd();
    log.push(text);
  };

  var _logChoices = function(choices, log) {
    var out = [];
    var titleIndent = 4;
    var subtitleIndent = 7;
    for (var i = 0; i < choices.length; ++i) {
      var choice = choices[i];
      var title = (i + 1) + '. ' + _lineToText(choice.title);
      if (!choice.canChoose) {
        title += ' [Unavailable]';
      }
      out.push(_indent(titleIndent, title));
      if (choice.subtitle) {
        out.push(_indent(subtitleIndent, choice.subtitle));
      }
    }
    log.push(out.join('\n'));
  };

  module.exports = {
    indent: _indent,
    convert: _paragraphsToText,
    convertLine: _lineToText,
    log: _logParagraphs,
    logChoices: _logChoices
  };
}());
