var Promise = require('bluebird');
var factory = require('./factory.js');

function Remote(options) {

    this.getConfig = function() {
        throw new Error('Implement this');
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
                var filepath =  path.join(componentsDir, self.name, 'component.json');

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
                return collector(components);
            });
    };
}


module.exports = Remote;