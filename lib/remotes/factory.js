var _ = require('../util.js');

var factory = module.exports = function factory(address) {
    var type = factory.detect(address);

    if (!type) {
        throw new Error('Unknow repository `' + address + '`');
    }

    var fn = factory.remotes[type];

    return new fn(address, factory.settings[type] || {});
};

factory.detect = function(address) {
    var remotes = factory.remotes;
    var keys = Object.keys(remotes);

    for (var i = 0, len = keys.length; i < len; i++) {
        var type = keys[i];
        var asDefault = type === settings.default;

        if (remotes[type].accept(address, asDefault)) {
            return type;
        }
    }

    return null;

};

var settings = factory.settings = {
    'default': 'github',

    componentsDir: '/components'
};
factory.setSettings = function(settings) {
    _.mixin(factory.settings, settings);
};

factory.remotes = {
    github: require('./github.js'),
    gitlab: require('./gitlab.js'),
    lights: require('./lights.js'),

    // todo
    // http: require('./http.js'),
    // svn: require('./svn.js')
};