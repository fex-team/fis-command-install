var request = require('request');
var Promise = require('bluebird');

function requestAPI(uri, callback) {
    var request = require('request');

    request({
        uri: uri,
        json: true,
        headers: {
            'User-Agent': 'request'
        }
    }, function(error, response, body) {
        if (response.statusCode !== 200) {
            var ret = response.body;
            callback(ret.message || ret || 'net error');
        } else {
            callback(false, body);
        }
    });
}

var exports = module.exports = function GithubRepos(options) {

    if (!(this instanceof GithubRepos)) {
        return new GithubRepos(options);
    }

    if (typeof options === 'string') {
        options = {
            address: options
        };
    }

    if (!exports.accept(options.address, true)) {
        throw new Error('Error!');
    }

    this.type = exports.type;
    this.author = RegExp.$1;
    this.name = RegExp.$2;
    this.address = this.author + '/' + this.name;
    var version = this._versionRaw = RegExp.$3;
    this._version = version === '*' ? 'latest' : version || 'latest';

    var settings = options.settings;

    this.getConfig = function() {

        if (this.config) {
            return Promise.resolve(this.config);
        }

        var self = this;

        return this

            // resolve the location.
            .resolve()

            .then(function(location) {

                if (self.config) {
                    return self.config;
                } else if (location === 'remote') {

                    // load config in remote.
                    return self

                        .getAvaiableVersions()

                        .then(function(versions) {

                            versions.sort(function(a, b) {
                                return a.localeCompare(b);
                            });

                            if (!self.version) {
                                var version = self._version;
                                var resolved;

                                if (version === 'latest') {
                                    resolved = versions[0];
                                } else {
                                    var semver = require('semver');

                                    versions.every(function(current) {
                                        var normalized = current.replace(/^v\s*/i, '');

                                        if (!/^\d+(\.\d+)*$/.test(normalized) && normalized === version) {
                                            resolved = current;
                                            return false;
                                        } else if (semver.satisfies(normalized, version)) {
                                            resolved = current;
                                            return false;
                                        }
                                    });
                                }

                                if (!resolved) {
                                    throw new Error('cannot find a version');
                                }

                                self.version = resolved;
                            }
                        })

                        .then(function() {
                            var request = Promise.promisify(requestAPI);
                            var ref = self.version === 'master' ? '' : '?ref=' + self.version;
                            return request('https://api.github.com/repos/' + self.address + '/contents/component.json' + ref);
                        })

                        .then(function(body) {
                            var content = body.content;

                            if (body.encoding === 'base64') {
                                content = new Buffer(content, 'base64').toString('utf8');
                            }

                            self.config = JSON.parse(content);

                            return self.config;
                        });
                }
            });
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
                var componentsDir = options.settings.componentsDir;
                var path = require('path');
                var exists = require('fs').existsSync;
                var filepath =  path.join(componentsDir, self.name, 'component.json');

                if (exists(filepath)) {
                    var getConfig = Promise.promisify(require('../config'));

                    return getConfig(filepath)

                        //
                        .then(function(json) {
                            var semver = require('semver');
                            var version = self._version;
                            var resolved;

                            if (!/^\d+(\.\d+)*$/.test(version)) {
                                resolved = json.version;
                            } else if (semver.satisfies(version, json.version)) {
                                resolved = json.version;
                                return false;
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

    // get remote repos tags and branches.
    this.getAvaiableVersions = function () {
        if (this.versions) {
            return Promise.resolve(this.versions);
        }

        var self = this;
        var versions = [];
        var request = Promise.promisify(requestAPI);
        return request('https://api.github.com/repos/' + self.address + '/tags')

            .then(function(tags) {
                tags.forEach(function(tag) {
                    versions.push(tag.name);
                });


                // no tags? now branchs.
                if (!versions.length) {
                    return request('https://api.github.com/repos/' + self.address + '/branchs')

                        .then(function(branchs) {
                            branchs.forEach(function(branch) {
                                versions.push(branch.name);
                            });
                        });
                }

                return versions;
            })

            .then(function(versions) {
                var ver2number = function(a) {
                    var m = /^v?(\d+)(?:\.(\d+))(?:\.(\d+))?$/i.exec(a);
                    if (m) {
                        return (m[1] << 20) + (m[2] << 10) + (m[3] || 0) << 0;
                    } else {
                        return 0;
                    }
                };

                self.versions = versions = versions.sort(function(a, b) {
                    return ver2number(b) - ver2number(a);
                });

                return versions;
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

                        return factory(type)({
                            address: component,
                            settings: settings
                        });
                    })
                    .filter(function(item) {
                        return item != null;
                    });

                var collector = require('../collector.js');
                return collector(components);
            });
    };


    this.install = function(progress) {
        var self = this;
        var Scaffold = require('fis-scaffold-kernel');
        var scaffold = new Scaffold({
            type: 'github',
            log: {
                level: 0
            }
        });

        return new Promise(function(resolve, reject) {

            scaffold.download(self.address + '@' + self.version, function(error, location) {

                if (error) {
                    return reject(error);
                }

                var path = require('path');
                var target = path.join(settings.componentsDir, self.name);
                var mapping = self.config.mapping || [{
                    reg: '*',
                    release: '$&'
                }];

                scaffold.deliver(location, target, mapping);

                resolve(self);
            }, progress);
        });
    };
};

exports.type = 'github';

exports.accept = function(address, asDefault) {
    var reg = /^github\:([0-9a-z-_]+)\/([0-9a-z-_]+)(?:@(.+?))?$/i;
    var regShort = /^([0-9a-z-_]+)\/([0-9a-z-_]+)(?:@(.+?))?$/i;

    return reg.test(address) || asDefault && regShort.test(address);
};