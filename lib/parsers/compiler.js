/* dendry
 * http://github.com/idmillington/dendry
 *
 * MIT License
 */
/*jshint indent:2 */
(function() {
  'use strict';

  var assert = require('assert');
  var _ = require('lodash');
  var async = require('async');

  var infoParser = require('./info');
  var sceneParser = require('./scene');
  var qualityParser = require('./quality');
  var qdisplayParser = require('./qdisplay');
  var dryParser = require('./dry');
  var logicParser = require('./logic');
  var validators = require('./validators');
  var engine = require('../engine');

  // Returns a list of ids to check, when trying to resolve a relative id.
  var getCandidateAbsoluteIds = function(contextId, id) {
    // Make sure we have valid ids.
    validators.validateRelativeId(id, null, function(err) {
      if (err) {
        throw err;
      }
    });
    var hasContext = contextId && contextId.length > 0;
    if (hasContext) {
      validators.validateId(contextId, null, function(err) {
        if (err) {
          throw err;
        }
      });
    }

    // Ids may begin with dots, which changes their meaning.
    var dots = 0;
    while (id.substr(dots, 1) === '.') {
      ++dots;
    }
    var extra = id.substr(dots);
    var hasExtra = extra.length > 0;

    var contextComponents;

    var result;
    if (dots === 0) {
      if (!hasContext) {
        // If we have no context, there is only a global id.
        result = [id];
      } else {
        // Check from local to global.
        contextComponents = contextId.split('.');
        result = [];
        for (var i = contextComponents.length; i > 0; --i) {
          var thisId = contextComponents.slice(0, i);
          thisId.push(id);
          result.push(thisId.join('.'));
        }
        result.push(id);
      }
    } else if (dots === 1) {
      if (hasExtra) {
        // This is an absolute id.
        result = [extra];
      } else {
        // We are referencing the current context.
        if (!hasContext) {
          throw new Error('Relative id "' + id + '" requires context.');
        }
        result = [contextId];
      }
    } else {
      if (!hasContext) {
        throw new Error('Relative id "' + id + '" requires context.');
      }

      // Go up the correct number of levels.
      contextComponents = contextId.split('.');
      var depthNeeded = hasExtra ? (dots - 1) : dots;
      if (contextComponents.length < depthNeeded) {
        throw new Error('Context is not deep enough.');
      }

      var resultComponents = contextComponents.slice(0, -dots + 1);

      // Add the extra, if we have it.
      if (hasExtra) {
        resultComponents.push(extra);
      }

      result = [resultComponents.join('.')];
    }
    return result;
  };

  /**
   * Uses the given list of scenes to figure out what fully-qualified
   * id is intended by the given id used in the given parent.
   */
  var getFullyQualifiedId = function(parentId, id, scenes) {
    var candidates = getCandidateAbsoluteIds(parentId, id);
    for (var i = 0; i < candidates.length; ++i) {
      var candidate = candidates[i];
      if (scenes[candidate] !== undefined) {
        return candidate;
      }
    }
    throw new Error(
      'Couldn\'t find an id matching "' + id + '" in "' + parentId + '".'
      );
  };

  // ----------------------------------------------------------------------

  var Game = function(infoDry) {
    _.merge(this, infoDry);
    this.scenes = {};
    this.qualities = {};
    this.qdisplays = {};
    this.tagLookup = {};
  };

  Game.prototype._addSceneToScenes = function(scene, parentId, callback) {
    var that = this;
    var id = scene.id;
    if (parentId !== undefined && id.lastIndexOf(parentId, 0) === -1) {
      // We have a scene id that doesn't include its parent, so add
      // the parent.
      id = parentId + '.' + id;
      scene.id = id;
    }

    if (this.scenes[id] !== undefined) {
      return callback(new Error(
        'Duplicate scenes with id "' + id + '" found.'
        ));
    }

    // Add the scene to the scene list.
    this.scenes[id] = scene;

    // Add tag lookups.
    if (scene.tags !== undefined) {
      _.each(scene.tags, function(tag) {
        if (that.tagLookup[tag] === undefined) {
          that.tagLookup[tag] = {};
        }
        that.tagLookup[tag][id] = true;
      });
    }

    // No error found.
    return callback(null);
  };

  // TODO: honestly, is there a reason to have async throughout the compilation process?
  Game.prototype._addTopLevelSceneToScenes = function(scene, callback) {
    var that = this;
    // Add sections as scenes.
    if (scene.sections !== undefined && scene.sections.length > 0) {
      async.eachSeries(scene.sections, function(section, done) {
        that._addSceneToScenes(section, scene.id, done);
      }, function(err) {
        if (err) {
          return callback(err);
        }
        // Add the main scene with an undefined parent.
        delete scene.sections;
        that._addSceneToScenes(scene, undefined, callback);
      });
    } else {
      // No sections (but we may have an empty array), just add the main scene.
      delete scene.sections;
      this._addSceneToScenes(scene, undefined, callback);
    }
  };

  Game.prototype._addScenes = function(listOfScenes, callback) {
    var that = this;
    async.each(listOfScenes, function(scene, done) {
      that._addTopLevelSceneToScenes(scene, done);
    }, callback);
  };

  // ........................................................................

  Game.prototype._addQualityToQualities = function(quality, callback) {
    this.qualities[quality.id] = quality;
    callback(null);
  };

  Game.prototype._addQualities = function(listOfQualities, callback) {
    var that = this;
    async.each(listOfQualities, function(quality, done) {
      that._addQualityToQualities(quality, done);
    }, callback);
  };

  // ........................................................................

  Game.prototype._addQDisplayToQDisplays = function(qdisplay, callback) {
    this.qdisplays[qdisplay.id] = qdisplay;
    callback(null);
  };

  Game.prototype._addQDisplays = function(listOfQDisplays, callback) {
    var that = this;
    async.each(listOfQDisplays, function(qdisplay, done) {
      that._addQDisplayToQDisplays(qdisplay, done);
    }, callback);
  };

  // ........................................................................
  // Id qualification
  // ........................................................................

  var getFunctionsInSchema = function(schema) {
    var result = [];
    for (var name in schema) {
      var value = schema[name];
      if (value.validate === validators.validatePredicate ||
          value.validate === validators.validateActions) {
        result.push(name);
      }
    }
    return result;
  };
  var sceneFunctions = getFunctionsInSchema(sceneParser.schema);
  var optionFunctions = getFunctionsInSchema(sceneParser.optionSchema);

  // TODO: fullyQualifyIds might be called before all scenes are loaded?

  Game.prototype._fullyQualifyIdsInOptions = function(scene, callback) {
    if (scene.options === undefined || scene.options.length === 0) {
      return callback(null);
    }

    var that = this;
    var scenes = this.scenes;
    async.each(scene.options, function(option, done) {
      if (option.id.substr(0, 1) === '@') {
        var oldId = option.id.substring(1);
        var newId;
        try {
          newId = getFullyQualifiedId(scene.id, oldId, scenes);
        } catch (err) {
          console.log(err.stack);
          return done(err);
        }
        option.id = '@' + newId;
      }
      that._fullyQualifyIdsIn(scene, option, optionFunctions, done);
    }, callback);
  };

  Game.prototype._fullyQualifyIdsInGoto = function(scene, callback) {
    if (scene.goTo === undefined || scene.goTo.length === 0) {
      return callback(null);
    }

    var that = this;
    var scenes = this.scenes;
    async.each(scene.goTo, function(goTo, done) {
      // Adjust id.
      var newId;
      try {
        newId = getFullyQualifiedId(scene.id, goTo.id, scenes);
      } catch (err) {
        console.log(err.stack);
        return done(err);
      }
      goTo.id = newId;

      // Adjust predicate.
      that._fullyQualifyIdsInFunctionByName(scene, goTo, 'predicate', done);
    }, callback);
  };
  
  Game.prototype._fullyQualityIdsInSetJump = function(scene) {
    if (scene.setJump === undefined || scene.setJump.length === 0) {
      return null;
    }
    var that = this;
    var scenes = this.scenes;
    var newId = getFullyQualifiedId(scene.id, scene.setJump, scenes);
    scene.setJump = newId;
  };

  var idInLogicRe = new RegExp(
    '\\@(' + dryParser.regexes.relativeIdString + ')', 'g'
  );
  Game.prototype._fullyQualifyIdsInFunction = function(scene, fn, callback) {
    if (fn === undefined ||
        fn.logicSource === undefined ||
        !idInLogicRe.test(fn.logicSource)) {
      // Nothing to do, return the unmodified function.
      return callback(null, fn);
    }

    // We've got ids in our source, replace them.
    var original = fn.logicSource;
    var source;
    var that = this;
    try {
      source = original.replace(idInLogicRe, function(_, sourceId) {
        var qualifiedId = getFullyQualifiedId(scene.id, sourceId, that.scenes);
        var max = that.scenes[qualifiedId].countVisitsMax;
        if (max === undefined) {
          var bits = [
            'Function refers to visit count of scene "', sourceId, '"'
          ];
          if (qualifiedId !== sourceId) {
            bits.push(' which resolves to "', qualifiedId, '"');
          }
          bits.push(' which has count-visits-max undefined.');
          throw new Error(bits.join(''));
        }
        return '@' + qualifiedId;
      });
    } catch (err) {
      console.log(err.stack);
      return callback(err);
    }

    // Recompile and return the function.
    switch (fn.root) {
    case 'predicate':
      logicParser.compilePredicate(source, callback);
      break;
    case 'actions':
      logicParser.compileActions(source, callback);
      break;
    default:
      assert(fn.root === 'expression');
      logicParser.compileExpression(source, callback);
      break;
    }
  };

  Game.prototype._fullyQualifyIdsInFunctionByName =
    function(scene, object, name, callback) {
      var fn = object[name];
      if (fn === undefined) {
        return callback(null);
      }

      if (_.isArray(fn)) {
        var that = this;
        var fns = fn;
        var indices = _.range(0, fns.length);
        async.each(indices, function(i, done) {
          var thisFn = fns[i];
          that._fullyQualifyIdsInFunction(scene, thisFn, function(err, fn) {
            if (err) {
              return done(err);
            }
            if (fns[i] !== fn) {
              fns[i] = fn;
            }
            return done(null);
          });
        }, callback);
      } else {
        this._fullyQualifyIdsInFunction(scene, fn, function(err, fn) {
          if (err) {
            return callback(err);
          }
          if (object[name] !== fn) {
            object[name] = fn;
          }
          return callback(null);
        });
      }
    };

  Game.prototype._fullyQualifyIdsIn = function(scene, object, names, callback) {
    var that = this;
    async.each(names, function(name, done) {
      that._fullyQualifyIdsInFunctionByName(scene, object, name, done);
    }, callback);
  };

  Game.prototype._fullyQualifyIdsInContent = function(scene, callback) {
    var that = this;
    if (scene.content === undefined) {
      return callback(null);
    }

    var deps = scene.content.stateDependencies;
    if (deps === undefined || deps.length === 0) {
      return callback(null, deps);
    }

    var indices = _.range(0, deps.length);
    async.each(indices, function(i, done) {
      var dep = deps[i];
      that._fullyQualifyIdsInFunction(scene, dep.fn, function(err, fn) {
        if (err) {
          return done(err);
        }
        dep.fn = fn;
        return done(null);
      });
    }, callback);
  };

  // Goes through all the relative ids in a scene and wires them to
  // the correct destination.
  Game.prototype._fullyQualifyIdsInScene = function(scene, callback) {
    var that = this;

    this._fullyQualityIdsInSetJump(scene);
    this._fullyQualifyIdsInGoto(scene, function(err) {
      if (err) {
        return callback(err);
      }

      that._fullyQualifyIdsInOptions(scene, function(err) {
        if (err) {
          return callback(err);
        }

        that._fullyQualifyIdsInContent(scene, function(err) {
          if (err) {
            return callback(err);
          }

          that._fullyQualifyIdsIn(scene, scene, sceneFunctions, callback);
        });
      });
    });
  };

  // ........................................................................

  Game.prototype._link = function(callback) {
    var that = this;
    var scenes = _.values(this.scenes);
    async.each(scenes, function(scene, done) {
      that._fullyQualifyIdsInScene(scene, done);
    }, callback);
  };

  // ........................................................................

  Game.prototype._checkOptionTitles = function(callback) {
    // Compile the tags that we use in links, we need to make sure
    // every scene with these tags have a title, since tags can't have
    // them.
    var that = this;
    var tagsUsedAsOptions = {};
    var err;
    _.every(_.values(this.scenes), function(scene) {
      return _.every(scene.options, function(option) {
        if (option.id.substr(0, 1) === '#') {
          // We have a tag, log it.
          tagsUsedAsOptions[option.id.substr(1)] = option.$metadata;
        } else if (option.id === '@prevScene') {
          // just let this happen
        } else {
          var targetScene = that.scenes[option.id.substr(1)];
          assert(targetScene !== undefined); // Should be caught earlier in link
          // We have an id, make sure either the option or the linked
          // scene have a title.
          if (!option.title && !targetScene.title) {
            err = new Error('Option refers to scene "' + targetScene.id +
                            '", but neither option nor scene have a title.');
            return false;
          }
        }
        return true;
      });
    });
    if (err) {
      return callback(err);
    }

    // Check all the items with the tags have titles.
    _.every(_.keys(tagsUsedAsOptions), function(tag) {
      var sceneIds = _.keys(that.tagLookup[tag]);
      if (sceneIds.length === 0) {
        err = new Error('We have an option pointing at a tag "' + tag +
                        '" which has no matching scenes.');
        return false;
      }

      return _.every(sceneIds, function(sceneId) {
        var scene = that.scenes[sceneId];
        if (!scene.title) {
          err = new Error(
            'Scene "' + sceneId + '" can be selected as an option for tag "' +
            tag + '" but has no title.'
            );
          return false;
        }
        return true;
      });
    });
    if (err) {
      return callback(err);
    }

    callback(null);
  };

  // ........................................................................
  // Linking
  // ........................................................................

  // Takes lists of dry files and builds a final playable game structure.
  var compile = function(infoDry,
                         listOfScenes, listOfQualities, listOfQDisplays,
                         callback) {
    var result = new Game(infoDry);

    // Add all scenes to the game.
    async.series([
      function(done) {
        result._addScenes(listOfScenes, done);
      },
      function(done) {
        result._addQualities(listOfQualities, done);
      },
      function(done) {
        result._addQDisplays(listOfQDisplays, done);
      },
      function(done) {
        result._link(done);
      },
      function(done) {
        result._checkOptionTitles(done);
      }],
      function(err) {
        if (err) {
          return callback(err);
        }

        // Convert back to a regular object.
        var obj = {};
        _.merge(obj, result);
        return callback(null, obj);
      });
  };

  // ----------------------------------------------------------------------


  // Compiles a list of dry data files into a game object.
  // A data file is a dict of the form {name : "filename.type.dry", contents: "string containing file data"}
  var compileGame = function(dry_files_contents, callback) {
    var info;
    // prevScene is a special scene that is always accessible and blank.
    // TODO: have a better way of displaying special scenes?
    var prevScene = {id: 'prevScene',
                     content: {content: '', type: 'paragraph'}};
    var prevTopScene = {id: 'prevTopScene',
                     content: {content: '', type: 'paragraph'}};
    var jumpScene = {id: 'jumpScene',
                     content: {content: '', type: 'paragraph'}};
    // returnScene is used with goSub...
    var returnScene = {id: 'returnScene',
                       content: {content: '', type: 'paragraph'}};
    // backSpecialScene should only be used within special scenes,
    // and is used to go back to the previous non-special scene.
    var backSpecialScene = {id: 'backSpecialScene',
                            content: {content: '', type: 'paragraph'}};
    var scenes = [prevScene, prevTopScene, jumpScene, backSpecialScene, returnScene];
    var qualities = [];
    var qdisplays = [];
    
    for(const file of dry_files_contents) {
      const {name:sourcePath, contents} = file;

      if (/(^|\/)info\.dry$/.test(sourcePath)) {
        infoParser.parseFromContent(sourcePath, contents, function(err, result) {
          /* istanbul ignore if */
          if (err) {
            return callback(err);
          }
          info = result;
        });
      } else if (/\.scene\.dry$/.test(sourcePath)) {
        sceneParser.parseFromContent(sourcePath, contents, function(err, result) {
          /* istanbul ignore if */
          if (err) {
            console.log(err.stack);
            return callback(err);
          }
          scenes.push(result);
        });
      } else if (/\.quality\.dry$/.test(sourcePath)) {
        qualityParser.parseFromContent(sourcePath, contents, function(err, result) {
          /* istanbul ignore if */
          if (err) {
            return callback(err);
          }
          qualities.push(result);
        });
      } else if (/\.qdisplay\.dry$/.test(sourcePath)) {
        qdisplayParser.parseFromContent(sourcePath, contents, function(err, result) {
          /* istanbul ignore if */
          if (err) {
            return callback(err);
          }
          qdisplays.push(result);
        });
        continue;
      } else {
        // Skip this file.
        continue;
      }
    }
    compile(info, scenes, qualities, qdisplays, function(err, game) {
      /* istanbul ignore if */
      if (err) {
        return callback(err);
      }
      callback(null, game);
    });
  };

  var convertGameToJSON = function(game, indent, callback) {
    var replacer = function(key, value) {
      if (key === '$metadata') {
        return undefined;
      } else if (_.isFunction(value)) {
        assert(value.source !== undefined);
        var source = value.source;
        return {$code:source};
      } else {
        return value;
      }
    };

    try {
      var json = JSON.stringify(game, replacer, indent);
      return callback(null, json);
    } catch (err) {
      /* istanbul ignore next */
      return callback(err);
    }
  };

  // Alias this, because we want to define it in engine.js (so the
  // game engine has fewer dependencies), but it is more logically
  // here with its counterpart, convertGameToJSON.
  var convertJSONToGame = engine.convertJSONToGame;

  // ----------------------------------------------------------------------

  module.exports = {
    compile: compile,
    getCandidateAbsoluteIds: getCandidateAbsoluteIds,
    compileGame: compileGame,
    convertJSONToGame: convertJSONToGame,
    convertGameToJSON: convertGameToJSON
  };
}());
