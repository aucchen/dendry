(function() {

    // TODO: log console to file rather than to the display
    var FileLogConsole = function(filename) {
        this.filename = filename;
    };

    FileLogConsole.prototype.log = function(text) {
    };

    module.exports = {
        FileLogConsole: FileLogConsole
    };

})();