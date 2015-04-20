var Promise = require('bluebird');
var factory = require('./factory.js');
var _ = require('../util.js');
var fs = require('fs');
var path = require('path');
var exists = fs.existsSync;
var write = fs.writeFileSync;
var read = fs.readFileSync;
var loadConfig = require('../config.js');

function Remote(address, options) {

    this.getConfig = function() {
        throw new Error('Implement this in sub class.');
    };

    // maybe already installed in /components.
    this.resolve = function() {
        if (this.location) {
            return Promise.resolve(this.location);
        }

        var self = this;

        return Promise

        // try local
            .try(function() {
            var componentsDir = factory.settings.componentsDir;
            var path = require('path');
            var exists = require('fs').existsSync;
            var filepath = path.join(componentsDir, self.name, 'component.json');

            if (exists(filepath)) {
                var getConfig = Promise.promisify(require('../config'));

                return getConfig(filepath)

                // 查看本地版本是否符合版本要求。
                .then(function(json) {
                    var semver = require('semver');
                    var version = self._version;
                    var resolved;

                    if (!/\d+(\.\d+)*$/.test(version)) {
                        resolved = json.version;
                    } else if (semver.satisfies(json.version, version)) {
                        resolved = json.version;
                    }

                    if (resolved) {
                        self.version = resolved;
                        self.config = json;
                        return 'local';
                    } else {
                        return 'remote';
                    }
                });

            }

            return 'remote';
        })

        .then(function(location) {
            self.location = location;
            return location;
        });
    };


    this.getDependencies = function() {
        if (this.dependencies) {
            return Promise.resolve(this.dependencies);
        }

        var self = this;

        return this

            .resolve()

        .then(this.getConfig.bind(this))

        .then(function(config) {
            return config.dependencies || [];
        })

        .then(function(components) {
            var factory = require('./factory.js');
            var logger = require('../logger.js');

            var origin = factory.getSettings();
            var config = self.config;
            var settings = {};

            config.protocol && (settings.protocol = config.protocol);
            config.github && _.mixin(settings, {
                github: config.github
            });
            config.gitlab && _.mixin(settings, {
                gitlab: config.gitlab
            });
            config.lights && _.mixin(settings, {
                lights: config.lights
            });

            factory.setSettings(settings);

            // validate and filter invalid dependencies.
            components = components
                .map(function(component) {
                    var type = factory.detect(component);
                    if (!type) {
                        logger.warn('`%s` is not a valid dependency.', component);
                        return null;
                    }

                    return factory(component);
                })
                .filter(function(item) {
                    return item != null;
                });

            var collector = require('../collector.js');
            return collector(components)

            // 还原 factory.settings
            .then(function(components) {
                factory.setSettings(origin);
                return components;
            });
        });
    };

    this.resolveVersion = function(versions) {
        if (!this.version) {
            var version = this._version;
            var resolved;

            if (version === '*') {
                resolved = versions[0];
            } else {
                var semver = require('semver');

                versions.every(function(current) {
                    var normalized = current.replace(/^v\s*/i, '');

                    if (!/^\d+(\.\d+)*$/.test(normalized) && normalized === version) {
                        resolved = current;
                        return false;
                    } else if (/\d/.test(normalized) && semver.satisfies(normalized, version)) {
                        resolved = current;
                        return false;
                    }

                    return true;
                });
            }

            if (!resolved && ~versions.indexOf('master')) {
                resolved = 'master';
            }

            if (!resolved) {
                throw new Error('cannot find matched version of `' + this.address + '@' + version + '`');
            }

            this.version = resolved;
        }

        return Promise.resolve(this.version);
    }


    this.noramlizeConfig = function(config) {
        if (config.dependencies && !Array.isArray(config.dependencies)) {
            var dependencies = [];

            Object.keys(config.dependencies).forEach(function(key) {
                var val = config.dependencies[key];

                dependencies.push(key + '@' + val);
            });

            config.dependencies = dependencies;
        }

        if (!config.mapping) {
            var mapping = [];
            ['scripts', 'styles', 'json', 'images', 'fonts', 'files', 'templates'].forEach(function(key) {
                if (config[key] && Array.isArray(config[key])) {
                    config[key].forEach(function(file) {
                        mapping.push({
                            reg: '/' + file,
                            release: file
                        })
                    });
                }
            });

            if (mapping.length) {
                mapping.push({
                    reg: /^\/README\.md$/i,
                    release: '$&'
                });

                mapping.push({
                    reg: /^\/component\.json$/i,
                    release: '$&'
                });

                mapping.push({
                    reg: '**',
                    release: false
                });
            }

            config.mapping = mapping;
        }


        return config;
    };

    this.convert = function(location) {
        // reload local config.
        var config = this.config = loadConfig(path.join(location, 'component.json'));

        // todo
        // add amd => cmd configruation.
        if (config.shim) {
            var shim = config.shim;

            Object.keys(shim).forEach(function(key) {
                var obj = shim[key];
                var filepath = path.join(location, key);

                if (!exists(filepath) && !obj.content) {
                    return;
                }

                if (Array.isArray(obj)) {
                    obj = {
                        deps: obj
                    }
                }

                var prefix = '';
                var affix = '';

                if (obj.deps) {
                    // require 同时赋值给某个变量。
                    var vars = obj.vars || [];

                    obj.deps.forEach(function(dep, i) {
                        prefix += (vars[i] ? ('var ' + vars[i] + ' = ') : '') + 'require(\'' + dep + '\');\n';
                    });
                }

                if (obj.init) {
                    affix = 'modules.exports = (' + obj.init + ')(' + (function() {
                        var deps = [];

                        if (obj.deps) {
                            obj.deps.forEach(function(dep) {
                                deps.push('require(\'' + dep + '\')');
                            });
                        }

                        return deps.join(', ');
                    })() + ');\n' + affix;
                } else if (obj.exports) {
                    affix = '\nmodule.exports = ' + obj.exports + ';\n' + affix;
                }

                var contents = prefix + (obj.content || read(filepath, 'utf8')) + affix;

                if (obj['replace']) {
                    var replace = obj['replace'];

                    if (!Array.isArray(replace)) {
                        replace = [replace];
                    }

                    replace.forEach(function(item) {
                        contents = contents.replace(item.from, item.to);
                    });
                }

                write(filepath, contents);
            });
        }
    }
}


module.exports = Remote;
