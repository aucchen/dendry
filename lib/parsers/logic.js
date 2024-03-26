/* dendry
 * http://github.com/idmillington/dendry
 *
 * MIT License
 */
/*jshint indent:2 */
(function() {
  'use strict';

  var gp = require('./gp');
  var engine = require('../engine');

  var tokenRules = [
    {regex:/and|AND/, token:'conjunction'},
    {regex:/or|OR/, token:'disjunction'},
    {regex:/not|NOT/, token:'negation'},
    {regex:/true|TRUE/, token:'boolean'},
    {regex:/false|FALSE/, token:'boolean'},
    {regex:/if/, token:'if'},
    {regex:/then/, token:'then'},
    {regex:/else/, token:'else'},
    {regex:/\=/, token:'equals'},
    {regex:/<=|>=|<|>|!=|==/, token:'comparator'},
    {regex:/\+=|-=|\*=|\/=/, token:'modification-operator'},
    {regex:/\+|-/, token:'additive-operator'},
    {regex:/\/|\*|%/, token:'mult-operator'},
    {regex:/(-)?([0-9]+(\.([0-9]+)?)?|\.[0-9]+)/, token:'number'},
    {regex:/[a-zA-Z][\-a-zA-Z0-9_]*/, token:'name'},
    {regex:/\@[\w-]+(?:\.[\w-]+)*/, token:'scene'},
    {regex:/\(/, token:'open-paren'},
    {regex:/\)/, token:'close-paren'},
    {regex:/,/, token:'comma'},
    {regex:/;/, token:'semi-colon'},
    {regex:/\./, token:'dot'},
    {regex:/"[^"]*"/, token:'quoted-string'},
    {regex:/'[^']*'/, token:'quoted-string'},
    {regex:/\s+/, token:undefined} // Skipped - doesn't appear in tokens
  ];

  // map of simple function names to more general functions?
  var _functionMap = {
    "rand": "Math.random",
    "sqrt": "Math.sqrt",
  };

  var _rule = gp.Parser.makeRule;

  // Create a parsing function that passes through its content.
  var _select = function(index) {
    return function(sequence) {
      return sequence[index];
    };
  };

  // Parsing function to infix a terminal symbol between two arguments
  // with parens.
  var _infix = function(sequence) {
    return _sequence(['('], sequence[0], [' ', sequence[1].text, ' '],
                     sequence[2], [')']);
  };

  // Parsing function to build a function, with optional arguments.
  var _fn = function(sequence) {
    if (sequence.length === 4) {
      return _sequence(['this.', sequence[0].text, '('],
                       sequence[2], [')']);
    } else {
      return _sequence(['this.', sequence[0].text, '()']);
    }
  };

  // Combine multiple sequences into one.
  var _sequence = function() {
    var result = [];
    for (var i = 0; i < arguments.length; ++i) {
      result.push.apply(result, arguments[i]);
    }
    return result;
  };

  // Makes a value safe, in case it can't be found.
  var _makeSafe = function(sequence) {
    return _sequence(['('], sequence[0], [' || 0)']);
  };

  // Returns a value, used top-level.
  var _return = function(sequence) {
    var item = sequence[0];
    return _sequence(['return '], item.token ? [item.text] : item, [';']);
  };

  var parserRules = [
    // Dummy rules to avoid unreferenced rule errors.
    _rule('.root ::= .actions', _select(0)),
    _rule('.root ::= .predicate', _select(0)),
    _rule('.root ::= .expression', _select(0)),

    // ACTIONS
    _rule('.actions ::= .actions semi-colon .command',
          function(sequence) {
            return _sequence(sequence[0], ['\n'], sequence[2]);
          }),
    _rule('.actions ::= .command', _select(0)),
    _rule('.command ::= .quality modification-operator .arithmetic',
          function(sequence) {
            return _sequence(sequence[0], [' = ('], sequence[0],
                             [' || 0) ', sequence[1].text.substr(0, 1), ' '],
                             sequence[2], [';']);
          }),
    _rule('.command ::= .quality equals .arithmetic',
          function(sequence) {
            return _sequence(sequence[0], [' = '], sequence[2], [';']);
          }),
    // assigning a quality to a string
    _rule('.command ::= .quality equals quoted-string', 
            function(sequence) {
                return _sequence(sequence[0], [' = '], [sequence[2].text], [';']);
            }),
    // assigning a quality to a boolean
    _rule('.command ::= .quality equals boolean', 
            function(sequence) {
                return _sequence(sequence[0], [' = '], [sequence[2].text.toLowerCase()], [';']);
            }),
    // assigning a quality to a comparison
    _rule('.command ::= .quality equals bool-exp', 
            function(sequence) {
                return _sequence(sequence[0], [' = '], sequence[2], [';']);
            }),
    _rule('.command ::= .command if .bool-exp',
            function(sequence) {
                return _sequence([' if ('], sequence[2], [' ) { '],
                    sequence[0], [' } ']);
            }),
    _rule('.command ::= .command if .bool-exp else .command',
            function(sequence) {
                return _sequence([' if ('], sequence[2], [' ) { \n'],
                    sequence[0], [';\n } else { '], sequence[5], [' } ']);
            }),
    _rule('.command ::= if .bool-exp then .command',
            function(sequence) {
                return _sequence([' if ('], sequence[1], [' ) { '],
                    sequence[3], [' } ']);
            }),
    _rule('.command ::= if .bool-exp then .command else .command',
            function(sequence) {
                return _sequence([' if ('], sequence[1], [' ) { '],
                    sequence[3], [';\n } else { '], sequence[5], [' } ']);
            }),


    // PREDICATE
    _rule('.predicate ::= .bool-exp', _return),

    // EXPRESSION
    _rule('.expression ::= .arithmetic', _return),

    // Content elements.
    _rule('.bool-exp ::= .bool-exp conjunction .bool-exp-2',
          function(sequence) {
            return _sequence(['('], sequence[0], [' && '], sequence[2], [')']);
          }),
    _rule('.bool-exp ::= .bool-exp-2', _select(0)),
    _rule('.bool-exp ::= boolean', _select(0)),
    _rule('.bool-exp ::= quality', _select(0)),
    _rule('.bool-exp-2 ::= .bool-exp-2 disjunction .bool-exp-3',
          function(sequence) {
            return _sequence(['('], sequence[0], [' || '], sequence[2], [')']);
          }),
    _rule('.bool-exp-2 ::= boolean', _select(0)),
    _rule('.bool-exp-2 ::= .bool-exp-3', _select(0)),
    _rule('.bool-exp-3 ::= negation .bool-exp-4',
          function(sequence) {
            return _sequence(['(!'], sequence[1], [')']);
          }),
    _rule('.bool-exp-3 ::= .bool-exp-4', _select(0)),
    _rule('.bool-exp-4 ::= open-paren .bool-exp close-paren',
          function(sequence) {
            return _sequence(['('], sequence[1], [')']);
          }),
    _rule('.bool-exp-4 ::= .comparison', _select(0)),
    _rule('.bool-exp-4 ::= boolean', _select(0)),

    _rule('.comparison ::= .arithmetic comparator .arithmetic', _infix),
    _rule('.comparison ::= .arithmetic equals .arithmetic',
          function(sequence) {
            return _sequence(['('], sequence[0], ['==='], sequence[2], [')']);
          }),
    // compare a string to a quoted string
    _rule('.comparison ::= .quality comparator quoted-string',
          function(sequence) {
            return _sequence(['('], sequence[0], [' ', sequence[1].text, ' '], [sequence[2].text], [')']);
          }),
    _rule('.comparison ::= .quality equals quoted-string',
          function(sequence) {
            return _sequence(['('], sequence[0], [' == '], [sequence[2].text], [')']);
          }),
    _rule('.comparison ::= .quality equals boolean',
          function(sequence) {
            return _sequence(['('], sequence[0], [' == '], [sequence[2].text.toLowerCase()], [')']);
          }),
    _rule('.comparison ::= boolean', function(sequence) {
      return [sequence[0].text.toLowerCase()];
    }),
    _rule('.comparison ::= .arithmetic', function(sequence) {
      return _sequence(['(('], sequence[0], [') !== 0)']);
    }),
    _rule('.arithmetic ::= .arithmetic additive-operator .arith-term', _infix),
    _rule('.arithmetic ::= .arith-term', _select(0)),
    _rule('.arith-term ::= .arith-term mult-operator .arith-factor', _infix),
    _rule('.arith-term ::= .arith-factor', _select(0)),
    _rule('.arith-factor ::= .value-safe', _select(0)),
    _rule('.arith-factor ::= number', function(sequence) {
      return [parseFloat(sequence[0].text)];
    }),
    _rule('.arith-factor ::= open-paren .arithmetic close-paren', _select(1)),
    _rule('.arith-factor ::= .function-call', _select(0)),
    _rule('.value-safe ::= .quality', _makeSafe),
    _rule('.value-safe ::= .visits', _makeSafe),
    _rule('.quality ::= name', function(sequence) {
      return ['Q[\'', sequence[0].text, '\']'];
    }),
    _rule('.visits ::= scene', function(sequence) {
      return ['state.visits[\'', sequence[0].text.substr(1), '\']'];
    }),
    _rule('.function-call ::= name open-paren close-paren', _fn),
    _rule('.function-call ::= name open-paren .arguments close-paren', _fn),
    _rule('.arguments ::= .argument comma .arguments',
          function(sequence) {
            return _sequence(sequence[0], [', '], sequence[2]);
          }),
    _rule('.arguments ::= .argument', _select(0)),
    _rule('.argument ::= .arithmetic', _select(0)),
    _rule('.argument ::= .bool-exp', _select(0))
  ];

  var tokenizer = new gp.Tokenizer(tokenRules);
  var parser = new gp.Parser(parserRules);

  var getMagic = function(logicSource, root, callback) {
    tokenizer.run(logicSource, function(err, tokens) {
      if (err) {
        return callback(err);
      }

      parser.run(tokens, root, logicSource, function(err, parse) {
        if (err) {
          return callback(err);
        } else {
          callback(null, parse.object.join(''));
        }
      });
    });
  };

  var compile = function(logicSource, root, callback) {
    getMagic(logicSource, root, function(err, magic) {
      if (err) {
        return callback(err);
      }
      var fn = engine.makeFunctionFromSource(magic);
      // Store what we need to remake this if we change it during linking.
      fn.logicSource = logicSource;
      fn.root = root;
      return callback(null, fn);
    });
  };

  var compileExpression = function(source, callback) {
    compile(source, 'expression', callback);
  };

  var compilePredicate = function(source, callback) {
    compile(source, 'predicate', callback);
  };

  var compileActions = function(source, callback) {
    // Adding trailing semis to the grammar would make it ambiguous, so remove
    // them here.
    source = source.replace(/;+\s*$/, '');
    compile(source, 'actions', callback);
  };

  module.exports = {
    getMagic: getMagic,

    compileExpression: compileExpression,
    compilePredicate: compilePredicate,
    compileActions: compileActions
  };

}());
