var SimpleTick = module.exports = function SimpleTick(prefix, options) {
    this.options = options = options || {};
    this.stream = options.stream || process.stderr;

    this.prefix = prefix;
    this.tokens = options.tokens || ['↑', '↗', '→', '↘', '↓', '↙', '←', '↖'];
    this.count = 0;
    this.render();
};

SimpleTick.prototype.render = function() {
    var len = this.tokens.length;
    var str = this.prefix + this.tokens[this.count%len] + ' ';

    if (str !== this.lastDraw) {
        this.stream.clearLine();
        this.stream.cursorTo(0);
        this.stream.write(str);
        this.lastDraw = str;
    }

};

SimpleTick.prototype.tick = function() {
    this.count++;
    this.render();
};

SimpleTick.prototype.clear = function() {
    this.stream.clearLine();
    this.stream.cursorTo(0);
}