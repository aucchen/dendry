(function() {

    // TODO: log console to file rather than to the display
    var FileLogConsole = function(filename) {
        this.filename = filename;
    };

    // TODO: doesn't quite work yet lol
    FileLogConsole.prototype.log = function(text) {
    };

    module.exports = {
        FileLogConsole: FileLogConsole
    };

})();
