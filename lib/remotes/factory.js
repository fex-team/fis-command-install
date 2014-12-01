var factory = module.exports = function factory(type) {
    return factory.remotes[type];
};

factory.detect = function(address) {
    var remotes = factory.remotes;
    var keys = Object.keys(remotes);

    for (var i = 0, len = keys.length; i < len; i++) {
        var type = keys[i];
        var asDefault = type === factory.default;

        if (remotes[type].accept(address, asDefault)) {
            return type;
        }
    }

    return null;

};

factory.remotes = {
    github: require('./github.js'),
    gitlab: require('./gitlab.js'),
    lights: require('./lights.js'),

    // todo
    // http: require('./http.js'),
    // svn: require('./svn.js')
};

// default remotes.
factory.default = 'github';