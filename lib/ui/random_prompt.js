(function() {

    // this file implements the prompt interface, as defined in cli.js.

    var engine = require('../engine');
    var toText = require('./content/text');
    var fs = require('fs');

    function dumpList(filename, list) {
        // dumps a list of strings into a file...
        var scenesString = '';
        for (var sceneName of list) {
          scenesString += sceneName + '\n';
        }
        fs.writeFileSync(filename, scenesString);
    }

    function RandomTestPrompt(dumpFile, scenesDumpFile, scriptDumpFile, outputDumpFile, inputScript, repeatThreshold) {
        // dumpfile is for dumping te end-game stats.
        this.dumpFile = dumpFile;
        // scriptDumpFile is for dumping the sequence of actions/choices.
        this.scriptDumpFile = scriptDumpFile;
        // outputDumpFile is for the textual outputs...
        this.outputDumpFile = outputDumpFile;
        // scenesDumpFile is the list of scenes.
        this.scenesDumpFile = scenesDumpFile;
        this.inputScript = inputScript;
        this.visitedScenes = [];
        this.scriptOut = [];
        // progress through the input script
        this.scriptProgress = 0;
        // previous scene ID
        this.lastScene = '';
        this.sceneCounter = {};
        this.currentSceneCounter = 0;
        // threshold for how often the current scene has to repeat before we quit.
        if (repeatThreshold) {
            this.repeatThreshold = repeatThreshold;
        } else {
            this.repeatThreshold = 10;
        }
    }

    // TODO: detect loops - if the same scene is repeated over and over...
    RandomTestPrompt.prototype.get = function(params, callback) {
        var param = params[0];
        var name = param.name;
        if (param.scene) {
            if (param.scene.id == this.lastScene) {
                this.currentSceneCounter += 1;
            } else {
                this.currentSceneCounter = 1;
                this.lastScene = param.scene.id;
            }
            this.visitedScenes.push(param.scene.id);
        }
        var result = {};
        var availableChoices = param.availableChoices;
        if (!param.numChoices || this.currentSceneCounter >= this.repeatThreshold) {
            if (this.currentSceneCounter >= this.repeatThreshold) {
                console.log('WARNING: Current scene has been repeated too many times, quitting');
            }
            if (this.scenesDumpFile) {
                console.log('Dumping visited scenes to ' + this.scenesDumpFile);
                dumpList(this.scenesDumpFile, this.visitedScenes);
            }
            if (this.scriptDumpFile) {
                console.log('Dumping script to ' + this.scriptDumpFile);
                dumpList(this.scriptDumpFile, this.scriptOut);
            }
            if (name == 'filename') {
                result[name] = String(this.dumpFile);
                return callback(false, result);
            }
            return callback(true);
        }
        var numChoices = param.numChoices;
        var choice = Math.ceil(Math.random()*(numChoices)); 
        while (!param.availableChoices[choice-1]) {
            choice = Math.ceil(Math.random()*(numChoices)); 
        }
        result[name] = String(choice);
        this.scriptOut.push(param.choices[choice-1].title);
        return callback(false, result);
    };

    RandomTestPrompt.prototype.start = function() {
    };

    module.exports = {
        RandomTestPrompt: RandomTestPrompt
    };

})();
