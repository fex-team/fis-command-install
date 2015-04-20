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
            'User-Agent': 'request'
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

var exports = module.exports = function LightsRepos(address, options) {

    if (!(this instanceof LightsRepos)) {
        return new LightsRepos(address, options);
    }

    if (!exports.accept(address, true)) {
        throw new Error('Error!');
    }

    options = _.mixin(_.mixin({}, exports.options), options);

    this.type = exports.type;
    this.repos = RegExp.$1 || options.repos;
    this.name = RegExp.$2;
    this.address = this.repos + '/' + this.name;
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
                        var version = self.version === 'master' ? '' : '&version=' + self.version;
                        return request('http://' + self.repos + '/repos/cli_detail?q=' + self.name + version);
                    })

                    .then(function(body) {

                        // 如果没有此 component.json
                        if (!body.contents && self.versions && self.versions.length) {
                            throw new Error('`lights:'+self.address+'` is an invalid component, please check this out [https://github.com/fis-components/spec].');
                        }

                        var content = body.contents;

                        if (body.encoding === 'base64') {
                            content = new Buffer(content, 'base64').toString('utf8');
                        }

                        self.config = JSON.parse(content);

                        if (!self.config || !self.config.name) {
                            throw new Error('`lights:'+self.address+'` is an invalid component, please check this out [https://github.com/fis-components/spec].');
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
        return request('http://' + self.repos + '/repos/cli_info?q=' + self.name)

            .then(function(body) {
                return body.versionHistory;
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
            type: 'lights',
            log: {
                level: 0
            },
            repos: 'http://' + options.repos
        });

        return new Promise(function(resolve, reject) {

            scaffold.download(self.name + '@' + self.version, function(error, location) {

                if (error) {
                    return reject(error);
                }
                self.convert(location);

                var path = require('path');
                var target = path.join(factory.settings.componentsDir, self.name);
                var mapping = self.config.mapping || [];

                if (mapping.length) {
                    mapping.unshift({
                        reg: /^\/component.json$/i,
                        release: '$1'
                    });
                    mapping.push({
                        reg: '**',
                        release: false
                    });
                } else {
                    mapping.push({
                        reg: '*',
                        release: '$&'
                    });
                }

                scaffold.deliver(location, target, mapping);

                resolve(self);
            }, progress);
        });
    };
};

exports.type = 'lights';

exports.accept = function(address, asDefault) {
    var options = _.mixin(_.mixin({}, exports.options), factory.settings.lights);
    var repos = options.repos;
    var reg = /^lights\:([^\/]+)\/([0-9a-z-_]+)(?:@(.+?))?$/i;
    var regShort = /^([^\/]+)\/([0-9a-z-_]+)(?:@(.+?))?$/i;
    var regShorter = /^lights\:(?:([^\/]+)\/)?([0-9a-z-_]+)(?:@(.+?))?$/i;
    var regShortest = /^(?:lights\:)?(?:([^\/]+)\/)?([0-9a-z-_]+)(?:@(.+?))?$/i;

    return reg.test(address) ||
        asDefault && regShort.test(address) ||
        repos && regShorter.test(address) ||
        asDefault && repos && regShortest.test(address);
};

exports.options = {
    repos: 'lightjs.duapp.com'
};
