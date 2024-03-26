/* dendry
 * http://github.com/idmillington/dendry
 *
 * MIT License
 */
/*jshint indent:2 */
(function() {
  'use strict';

  var _ = require('lodash');
  var should = require('should');
  // Disable errors from using the should library.
  /*jshint -W030 */

  var noerr = function(err) {
    if (err) {
      console.trace(err);
    }
    (!!err).should.be.false;
  };

  var logic = require('../lib/parsers/logic');
  var engine = require('../lib/engine');

  describe('logic-compiler', function() {

    // ----------------------------------------------------------------------

    describe('predicate', function() {
      it('should compile a trivial predicate', function(done) {
        logic.compilePredicate('true', function(err, fn) {
          noerr(err);
          var state = {
            qualities: {}
          };
          engine.runPredicate(fn, false, {}, state).should.be.true;
          done();
        });
      });

      it('should look up qualities', function(done) {
        logic.compilePredicate('foo > 0', function(err, fn) {
          noerr(err);
          var state = {
            qualities: {foo: 1}
          };
          engine.runPredicate(fn, false, {}, state).should.be.true;
          done();
        });
      });

      it('should look up visits', function(done) {
        logic.compilePredicate('@foo > 0', function(err, fn) {
          noerr(err);
          var state = {
            qualities: {},
            visits: {foo:1}
          };
          engine.runPredicate(fn, false, {}, state).should.be.true;
          done();
        });
      });

      it('should look up complex scene ids', function(done) {
        logic.compilePredicate('@foo.bar.sun > 0', function(err, fn) {
          noerr(err);
          var state = {
            qualities: {},
            visits: {'foo.bar.sun':1}
          };
          engine.runPredicate(fn, false, {}, state).should.be.true;
          done();
        });
      });

      it('should default to zero when looking up visits', function(done) {
        logic.compilePredicate('@foo > 0', function(err, fn) {
          noerr(err);
          var state = {
            qualities: {},
            visits: {}
          };
          engine.runPredicate(fn, false, {}, state).should.be.false;
          done();
        });
      });

      it('should default to 0 on unknown quality access', function(done) {
        logic.compilePredicate('foo = 0', function(err, fn) {
          noerr(err);
          var state = {
            qualities: {}
          };
          engine.runPredicate(fn, false, {}, state).should.be.true;
          done();
        });
      });

      var nonzeroCases = [
        {Q:{}, result:false, desc:'unknown quality should default to false'},
        {Q:{foo:0}, result:false, desc:'zero values should be false'},
        {Q:{foo:1}, result:true, desc:'positive values should be true'},
        {Q:{foo:-1}, result:true, desc:'negative values should be true'}
      ];
      _.each(nonzeroCases, function(test) {
        it('bare numbers: ' + test.desc, function(done) {
          logic.compilePredicate('foo', function(err, fn) {
            noerr(err);
            var state = {
              qualities: test.Q
            };
            engine.runPredicate(fn, false, {}, state).should.equal(test.result);
            done();
          });
        });
      });

      it('should support three clause conjunction', function(done) {
        // Regression: three ands in sequence omits the final clause
        // in code generation.
        logic.compilePredicate(
          'foo = 1 and bar = 1 and sun = 1',
          function(err, fn) {
            noerr(err);
            var state = {
              qualities: {
                foo: 1,
                bar: 1,
                sun: 1
              }
            };
            // The predicate can be true even if the final clause is omitted.
            engine.runPredicate(fn, false, {}, state).should.be.true;
            state.qualities.sun = 0;
            // But it won't turn to false if we invalidate the final clause.
            engine.runPredicate(fn, false, {}, state).should.be.false;
            done();
          });
      });

      it('should support three clause disjunction', function(done) {
        logic.compilePredicate(
          'foo = 1 or bar = 1 or sun = 1',
          function(err, fn) {
            noerr(err);
            var state = {
              qualities: {
                sun: 1
              }
            };
            engine.runPredicate(fn, false, {}, state).should.be.true;
            done();
          });
      });

      it('should support complex boolean queries', function(done) {
        logic.compilePredicate(
          'foo = 1 and (foo < bar or not foo > sun)',
          function(err, fn) {
            noerr(err);
            var state = {
              qualities: {
                foo: 1,
                bar: 1,
                sun: 1
              }
            };
            engine.runPredicate(fn, false, {}, state).should.be.true;
            done();
          });
      });

      it('should support complex boolean queries with visits', function(done) {
        logic.compilePredicate(
          'foo = 1 and (foo < @bar or not foo > @sun) and @sun',
          function(err, fn) {
            noerr(err);
            var state = {
              qualities: {
                foo: 1
              },
              visits: {
                bar: 1,
                sun: 1
              }
            };
            engine.runPredicate(fn, false, {}, state).should.be.true;
            state.visits.sun = 0;
            state.visits.bar = 2;
            // Fail on last AND clause.
            engine.runPredicate(fn, false, {}, state).should.be.false;
            done();
          });
      });

      it('should support function calls', function(done) {
        logic.compilePredicate(
          'foo() = 2 and bar(3, 2) = 6',
          function(err, fn) {
            noerr(err);
            var functions = {
              foo: function() { return 2; },
              bar: function(a, b) { return a * b; }
            };
            var state = {
              qualities: {}
            };
            engine.runPredicate(fn, false, functions, state).should.be.true;
            done();
          });
      });

      it('should augment function with metadata', function(done) {
        var src = 'foo() = 2 and bar(3, 2) = 6';
        logic.compilePredicate(
          src,
          function(err, fn) {
            noerr(err);
            fn.logicSource.should.equal(src);
            fn.root.should.equal('predicate');
            done();
          });
      });

      it('should pass on tokenizer errors', function(done) {
        logic.compilePredicate('$foo', function(err, fn) {
          (!!err).should.be.true;
          err.toString().includes(
            'Unrecognized content at position 0.'
          ).should.be.true;
          done();
        });
      });

      it('should pass on compiler errors', function(done) {
        logic.compilePredicate('true foo', function(err, fn) {
          (!!err).should.be.true;
          err.toString().startsWith(
            'Error: No valid way to parse this content'
          ).should.be.true;
          done();
        });
      });

      it('should allow string equality comparisons', function(done) {
        logic.compilePredicate(
          'foo = "abc" and bar = ""',
          function(err, fn) {
            noerr(err);
            var state = {
              qualities: {
                foo: "abc",
                bar: "",
              }
            };
            engine.runPredicate(fn, false, {}, state).should.be.true;
            done();
          });
      });

      it('should work with single-quoted strings', function(done) {
        logic.compilePredicate(
          "foo = 'abc' and bar = ' '",
          function(err, fn) {
            noerr(err);
            var state = {
              qualities: {
                foo: "abc",
                bar: " ",
              }
            };
            engine.runPredicate(fn, false, {}, state).should.be.true;
            done();
          });
      });

      it('should work with single and double equals signs', function(done) {
        logic.compilePredicate(
          "foo == 'abc' and bar == ' ' and x == 2",
          function(err, fn) {
            noerr(err);
            var state = {
              qualities: {
                foo: "abc",
                bar: " ",
                x: 2,
              }
            };
            engine.runPredicate(fn, false, {}, state).should.be.true;
            done();
          });
      });

    });

    // ----------------------------------------------------------------------

    describe('actions', function() {
      it('should set qualities', function(done) {
        logic.compileActions('foo = 1', function(err, fn) {
          noerr(err);
          var state = {
            qualities: {}
          };
          engine.runActions([fn], {}, state);
          state.qualities.foo.should.equal(1);
          done();
        });
      });

      it('should allow value references', function(done) {
        logic.compileActions('foo = bar', function(err, fn) {
          noerr(err);
          var state = {
            qualities: {
              bar: 1
            }
          };
          engine.runActions([fn], {}, state);
          state.qualities.foo.should.equal(1);
          done();
        });
      });

      it('should allow arithmetic', function(done) {
        logic.compileActions('foo = sun + dock - trog', function(err, fn) {
          noerr(err);
          var state = {
            qualities: {
              sun: 2,
              dock: 3,
              trog: 1
            }
          };
          engine.runActions([fn], {}, state);
          state.qualities.foo.should.equal(4);
          done();
        });
      });

      it('should allow repeated operation', function(done) {
        logic.compileActions('foo = sun + dock + trog', function(err, fn) {
          noerr(err);
          var state = {
            qualities: {
              sun: 2,
              dock: 3,
              trog: 1
            }
          };
          engine.runActions([fn], {}, state);
          state.qualities.foo.should.equal(6);
          done();
        });
      });

      it('should allow two statements', function(done) {
        logic.compileActions('foo = 1; foo += 1;', function(err, fn) {
          noerr(err);
          var state = {
            qualities: {}
          };
          engine.runActions([fn], {}, state);
          state.qualities.foo.should.equal(2);
          done();
        });
      });

      it('should allow three statements', function(done) {
        logic.compileActions('foo = 1; foo += 1; foo *= 2;', function(err, fn) {
          noerr(err);
          var state = {
            qualities: {}
          };
          engine.runActions([fn], {}, state);
          state.qualities.foo.should.equal(4);
          done();
        });
      });

      it('should allow three statements without trailing semi', function(done) {
        logic.compileActions('foo = 1; foo += 1; foo *= 2', function(err, fn) {
          noerr(err);
          var state = {
            qualities: {}
          };
          engine.runActions([fn], {}, state);
          state.qualities.foo.should.equal(4);
          done();
        });
      });

      it('doesn\'t require terminal semicolon', function(done) {
        logic.compileActions('foo = 1; foo += 1', function(err, fn) {
          noerr(err);
          var state = {
            qualities: {}
          };
          engine.runActions([fn], {}, state);
          state.qualities.foo.should.equal(2);
          done();
        });
      });

      it('should augment function with metadata', function(done) {
        var src = 'foo = 1; foo += 1';
        logic.compileActions(
          src,
          function(err, fn) {
            noerr(err);
            fn.logicSource.should.equal(src);
            fn.root.should.equal('actions');
            done();
          });
      });

    it('should allow the creation of string variables', function(done) {
        logic.compileActions('bar = "abc"; foo = ""', function(err, fn) {
          noerr(err);
          var state = {
            qualities: {}
          };
          engine.runActions([fn], {}, state);
          state.qualities.bar.should.equal("abc");
          state.qualities.foo.should.equal("");
          done();
        });
      });

      it('should default to 0 on unknown quality modification', function(done) {
        logic.compileActions('bar *= 2; foo += 1;', function(err, fn) {
          noerr(err);
          var state = {
            qualities: {}
          };
          engine.runActions([fn], {}, state);
          state.qualities.bar.should.equal(0);
          state.qualities.foo.should.equal(1);
          done();
        });
      });
    });

    // ----------------------------------------------------------------------

  });

}());
