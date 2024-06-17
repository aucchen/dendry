/* dendry
 * http://github.com/idmillington/dendry
 *
 * MIT License
 */
/*jshint indent:2 */
(function() {
  'use strict';

  var _ = require('lodash');
  var prompt = require('prompt');
  var async = require('async');
  var fs = require('fs');
  var assert = require('assert');
  var wordwrap = require('wordwrap');

  var engine = require('../engine');
  var toText = require('./content/text');

  // A game is required, but the prompt and output objects are not: they
  // allow us to override how the interaction takes place, to drive the
  // system from a test.
  var CommandLineUserInterface = function(game, consoleObj, promptObj, width, randomTest, outputFile) {
    this.game = game;
    this.console = consoleObj || console;
    this.prompt = promptObj || prompt;
    this.defaultWidth = width;
    this.randomTest = randomTest;
    if (this.randomTest) {
        console.log('Running random test');
    }
    this.outputFile = outputFile || null;

    this.currentText = '';

    this.dendryEngine = new engine.DendryEngine(this, game);
  };
  engine.UserInterface.makeParentOf(CommandLineUserInterface);

  // ------------------------------------------------------------------------
  // Interface fulfilment.
  CommandLineUserInterface.prototype.displayContent = function(paragraphs) {
    var width = this._getWidth();
    var text = toText.convert(paragraphs, width).trim();
    this.console.log(text);
  };

  CommandLineUserInterface.prototype.displayChoices = function(choices) {
    var width = this._getWidth();
    var titleWrap = wordwrap(4, width);
    var subtitleWrap = wordwrap(7, width);
    for (var i = 0; i < choices.length; ++i) {
      var choice = choices[i];
      var title = (i + 1) + '. ' + toText.convertLine(choice.title);
      if (!choice.canChoose) {
        title = title.grey;
        title += ' [Unavailable]';
      }
      title = titleWrap(title);
      this.console.log(title);
      if (choice.subtitle) {
        var subtitle = subtitleWrap(choice.subtitle);
        this.console.log(subtitle.grey);
      }
    }
  };

  CommandLineUserInterface.prototype.newPage = function() {
    this._line('=');
  };

  CommandLineUserInterface.prototype.beginGame = function() {
    this._line();
    this.console.log(this.game.title.bold + ' by '.grey +
                     this.game.author.white.bold);
    this.console.log('(Ctrl+D or Q at prompt stops the game)'.grey);
    this._line();
  };

  // ------------------------------------------------------------------------
  // Main entry point.

  CommandLineUserInterface.prototype.run = function(state, callback) {
    if (callback === undefined) {
      callback = state;
      state = undefined;
    }
    if (state) {
      this.beginGame();
      this.dendryEngine.setState(state);
    } else {
      this.dendryEngine.beginGame();
    }
    return this._doChoice(callback);
  };

  // ------------------------------------------------------------------------
  // Internal helpers.

  CommandLineUserInterface.prototype._getWidth = function() {
    if (!process.stdout.getWindowSize) {
        return this.defaultWidth;
    }
    return this.defaultWidth || (process.stdout.getWindowSize()[0] - 2);
  };

  CommandLineUserInterface.prototype._line = function(symbol, num) {
    symbol = symbol || '-';
    num = num || this._getWidth();
    var line = _.times(num, _.constant(symbol)).join('').grey;
    this.console.log(line);
  };

  CommandLineUserInterface.prototype._dumpAndContinue = function(callback) {
    var that = this;

    var cont = function() {
      async.nextTick(function() {
        that._doChoice(callback);
      });
    };

    var error = function(msg) {
      that.console.log(msg.red);
      that.console.log('State not dumped, continuing.'.red);
      cont();
    };

    this.console.log(
      'Enter filename to dump state to, or leave blank to dump to console.'.grey
    );
    this.prompt.get([{
      name: 'filename',
      required: false
    }], function(err, filename) {
      // No conformance check, so no error should be possible.
      assert(!err);

      var json = JSON.stringify(that.dendryEngine.getExportableState());

      filename = filename.filename.trim();
      if (filename && filename.length > 0) {
        fs.writeFile(filename, json, function(err) {
          if (err) {
            error(err.toString());
          } else {
            that.console.log('Dumped to ' + filename + '\n');
            cont();
          }
        });
      } else {
        that.console.log(json);
        cont();
      }
    });
  };

  CommandLineUserInterface.prototype._dumpAndQuit = function() {
    var that = this;

    var error = function(msg) {
      that.console.log(msg.red);
      that.console.log('State not dumped, continuing.'.red);
      cont();
    };

    this.console.log(
      'Enter filename to dump state to, or leave blank to dump to console.'.grey
    );
    this.prompt.get([{
      name: 'filename',
      required: false
    }], function(err, filename) {
      // No conformance check, so no error should be possible.
      assert(!err);

      var json = JSON.stringify(that.dendryEngine.getExportableState());

      filename = filename.filename.trim();
      if (filename && filename.length > 0) {
        fs.writeFile(filename, json, function(err) {
          if (err) {
            error(err.toString());
          } else {
            that.console.log('Dumped to ' + filename + '\n');
          }
        });
      } else {
        that.console.log(json);
      }
    });
  };


  CommandLineUserInterface.prototype._doChoice = function(callback) {
    var that = this;

    if (this.dendryEngine.isGameOver()) {
      if (this.randomTest) {
          this._dumpAndQuit();
      }
      return callback();
    }
    var choices = this.dendryEngine.getCurrentChoices();
    var availableChoices = [];
    for (var i = 0; i < choices.length; i++) {
        availableChoices.push(choices[i].canChoose);
    }
    var maxv = choices.length;

    var cleanChoice = function(value) {
      value = value.trim().toLowerCase();
      if (value === 'q' || value === 'd') {
        return value;
      }
      value = parseInt(value);
      if (!isNaN(value)) {
        return value;
      }
      return undefined;
    };

    if (!this.randomTest) {
        this.prompt.message = 'Dendry'.grey;
    }
    // Give the data to the prompt?
    var currentScene = this.dendryEngine.getCurrentScene();
    this.prompt.start();
    this.prompt.get([{
      name: 'choice',
      scene: currentScene,
      choices: choices,
      required: true,
      conform: function(value) {
        var opt = cleanChoice(value);
        if (opt === undefined) {
          return false;
        } else if (opt === 'q' || opt === 'd') {
          return true;
        } else if (opt <= 0 || opt > maxv) {
          return false;
        } else {
          return choices[opt - 1].canChoose;
        }
      },
      numChoices: maxv,
      availableChoices: availableChoices
    }], function(err, result) {
      if (err) {
        return callback(err);
      }
      that.console.log('');
      var opt = cleanChoice(result.choice);
      if (that.randomTest) {
        that.console.log(result.choice + '\n');
      }
      switch (opt) {
      case 'q':
        // Don't do anything else, just finish.
        return callback();
      case 'd':
        that._dumpAndContinue(callback);
        break;
      default:
        that.dendryEngine.choose(opt - 1);
        async.nextTick(function() {
          that._doChoice(callback);
        });
        break;
      }
    });
  };

  module.exports = {
    CommandLineUserInterface: CommandLineUserInterface
  };

}());
