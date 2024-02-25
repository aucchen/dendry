(function() {

    // this file implements the prompt interface, as defined in cli.js.

    var engine = require('../engine');
    var toText = require('./content/text');

    function RandomTestPrompt(dumpFile, scriptDumpFile, outputDumpFile, scenesDumpFile, inputScript) {
        // dumpfile is for dumping te end-game stats.
        this.dumpFile = dumpFile;
        // scriptDumpFile is for dumping the sequence of actions.
        this.scriptDumpFile = scriptDumpFile;
    }

    RandomTestPrompt.prototype.get = function(params, callback) {
        var param = params[0];
        var name = param.name;
        var result = {};
        var availableChoices = param.availableChoices;
        if (!param.numChoices) {
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
        return callback(false, result);
    };

    RandomTestPrompt.prototype.start = function() {
    };

    module.exports = {
        RandomTestPrompt: RandomTestPrompt
    };

})();
