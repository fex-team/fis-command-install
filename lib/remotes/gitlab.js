var request = require('request');
var Promise = require('bluebird');
var Remote = require('./remote.js');
var _ = require('../util.js');
var factory = require('./factory.js');

function requestAPI(uri, callback) {
    var request = require('request');

    request({
        uri: uri,
        json: true,
        headers: {
            'User-Agent': 'request',
            'PRIVATE-TOKEN': 'XsYDeyqyFD777qgovh15'
        }
    }, function(error, response, body) {
        if (!response || response.statusCode !== 200) {
            var ret = response && response.body;
            callback(ret && ret.message || ret || 'net error');
        } else {
            callback(false, body);
        }
    });
}

var exports = module.exports = function GitlabRepos(address, options) {

    if (!(this instanceof GitlabRepos)) {
        return new GitlabRepos(address, options);
    }

    if (!exports.accept(address, true)) {
        throw new Error('Error!');
    }

    options = _.mixin(_.mixin({}, exports.options), options);

    this.type = exports.type;
    this.author = RegExp.$1 || options.author;
    this.name = RegExp.$2;
    this.address = this.author + '/' + this.name;
    var version = this._versionRaw = RegExp.$3;
    this._version = version === 'latest' ? '*' : version || '*';

    Remote.apply(this, arguments);

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
                }


                // load config in remote.
                return self

                    .getAvaiableVersions()

                    .then(self.resolveVersion.bind(self))

                    .then(function() {
                        var request = Promise.promisify(requestAPI);
                        var projectId = encodeURIComponent(self.address);
                        var ref = self.version === 'master' ? '' : '?ref=' + self.version;
                        return request('http://gitlab.baidu.com/api/v3/projects/' + projectId + '/repository/blobs/'+self.version + '?filepath=component.json');
                    })

                    .error(function(e) {
                        if (/Not\sFound/i.test(e.message)) {
                            throw new Error('`gitlab:'+self.address+'` is an invalid component, please check this out [https://github.com/fis-components/spec].');
                        }
                    })

                    .then(function(body) {
                        self.config = body;

                        if (!body || !body.name) {
                            throw new Error('`gitlab:'+self.address+'` is an invalid component, please check this out [https://github.com/fis-components/spec].');
                        }

                        return self.config;
                    });
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
        var projectId = encodeURIComponent(this.address);
        return request('http://gitlab.baidu.com/api/v3/projects/' + projectId + '/repository/tags')

            .then(function(tags) {
                tags.forEach(function(tag) {
                    versions.push(tag.name);
                });


                // no tags? now branchs.
                if (!versions.length) {
                    return request('http://gitlab.baidu.com/api/v3/projects/' + projectId + '/repository/branches')

                        .then(function(branchs) {
                            branchs.forEach(function(branch) {
                                versions.push(branch.name);
                            });

                            return versions;
                        });
                }
                return versions;
            })

            .then(function(versions) {
                self.versions = versions = versions.sort(_.compareVersion);

                return self.versions;
            });
    };

    this.install = function(progress) {
        var self = this;
        var Scaffold = require('fis-scaffold-kernel');
        var scaffold = new Scaffold({
            type: 'gitlab',
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
                var target = path.join(factory.settings.componentsDir, self.name);
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

exports.type = 'gitlab';

exports.accept = function(address, asDefault) {
    var options = _.mixin(_.mixin({}, exports.options), factory.settings.gitlab);
    var author = options.author;
    var reg = /^gitlab\:([0-9a-z-_]+)\/([0-9a-z-_]+)(?:@(.+?))?$/i;
    var regShort = /^([0-9a-z-_]+)\/([0-9a-z-_]+)(?:@(.+?))?$/i;
    var regShorter = /^gitlab\:(?:([0-9a-z-_]+)\/)?([0-9a-z-_]+)(?:@(.+?))?$/i;
    var regShortest = /^(?:gitlab\:)?(?:([0-9a-z-_]+)\/)?([0-9a-z-_]+)(?:@(.+?))?$/i;

    return reg.test(address) ||
        asDefault && regShort.test(address) ||
        author && regShorter.test(address) ||
        asDefault && author && regShortest.test(address);
};

exports.options = {
    author: 'fis-components'
};