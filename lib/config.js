var fs = require('fs');
var path = require('path');

var exists = fs.existsSync;

var config = module.exports = function config(filepath, callback) {
    if (!exists(filepath)) {
        return callback('missing component.json');
    }

    try {
        var json = require(path.resolve(filepath));
    } catch (e) {
        return callback('load `' + filepath + '` got error!');
    }

    // load mapping js config.
    if (json.mapping) {
        var js = path.join(path.dirname(filepath), json.mapping);

        if (exists(js)) {
            try {
                var script = require(js);
                json.mapping = typeof script === 'function' ? script(json) : script;
            } catch (e) {
                return callback(e.message);
            }
        }
    }

    callback(null, json);
};
