var request = require('request');
var Promise = require('bluebird');
var Remote = require('./remote.js');
var _ = require('../util.js');
var client = 'client_id=afcf7c0f81ffecf6d894&client_secret=1bc98981703eaae3175ce7ab2d58f42b687da241';
var factory = require('./factory.js');

function requestAPI(uri, callback) {
    var request = require('request');

    uri += (~uri.indexOf('?') ? '&' : '?') + client;

    var req = request({
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

function loadRemote(uri, callback) {
    var request = require('request');

    request(uri, function(error, response, body) {
        if (response && response.statusCode === 200) {
            callback(false, {
                content: body
            })
        } else if (response && (response.statusCode === 301 || response.statusCode === 302) && response.headers['Location']) {
            return loadRemote(response.headers['Location'], callback);
        } else {
            callback('Error load remote.')
        }
    });
}

var exports = module.exports = function GithubRepos(address, options) {

    if (!(this instanceof GithubRepos)) {
        return new GithubRepos(address, options);
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
                        var load = Promise.promisify(loadRemote);

                        if (self.address.indexOf('fis-components/') === 0){
                          return loadFromMirror();
                        }
                        return loadFromGithub();

                        function loadFromMirror() {
                          var name = self.address.substring(15);

                          return load('http://fis-cloud.bj.bcebos.com/components/' + name + '/' + self.version + '/component.json?responseContentDisposition=attachment')

                            .error(function() {
                              console.log('Load component.json from mirror failed.');
                              console.log('Fallback to github.')
                              return loadFromGithub();
                            })
                        }

                        function loadFromGithub() {
                          return load('https://raw.githubusercontent.com/' + self.address + '/' + self.version + '/component.json');
                        }
                    })

                    .error(function(e) {
                        if (/Not\s+Found/i.test(e.message)) {
                            throw new Error('`github:'+self.address+'` not found.');
                        }
                    })

                    .then(function(body) {
                        if (!body) {
                            throw new Error('`github:'+self.address+'` not found.');
                        }

                        var content = body.content;

                        if (body.encoding === 'base64') {
                            content = new Buffer(content, 'base64').toString('utf8');
                        }

                        self.config = self.noramlizeConfig(JSON.parse(content));

                        if (!self.config || !self.config.name) {
                            throw new Error('`github:'+self.address+'` is an invalid component, please check this out [https://github.com/fis-components/spec].');
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

        // /jquery/jquery/tree/2.1.1

        //

        var self = this;
        var versions = [];

        var load = Promise.promisify(loadRemote);

        if (self.address.indexOf('fis-components/') === 0){
          return loadFromMirror();
        }

        return loadFromGithub();

        function loadFromMirror() {
          var name = self.address.substring(15);

          return load('http://fis-cloud.bj.bcebos.com/components/' + name + '/versions.txt?responseContentDisposition=attachment')

            .then(function(content) {
              content = content.content || content;
              var versions = content.trim().split(/\s+/);

              return versions.sort(_.compareVersion);
            })

            .error(function() {
              console.log('Load versions from mirror failed.');
              console.log('Fallback to github.');
              return loadFromGithub();
            })
        }

        function loadFromGithub() {
          return load('https://github.com/' + self.address)

            .then(function(content) {
                var reg = /href=('|")\/[^\/]+\/[^\/]+\/tree\/(.*?)\1/ig;
                var versions = [];
                var m;

                content = content.content || content;

                content.replace(reg, function(_, __, name) {
                    versions.push(name);
                });

                self.versions = versions = versions.sort(_.compareVersion);

                return versions;
            });
        }


        // 走 github api.
        // var request = Promise.promisify(requestAPI);
        // return request('https://api.github.com/repos/' + self.address + '/tags')

        //     .then(function(tags) {
        //         tags.forEach(function(tag) {
        //             versions.push(tag.name);
        //         });


        //         // no tags? now branchs.
        //         if (!versions.length) {
        //             return request('https://api.github.com/repos/' + self.address + '/branchs')

        //                 .then(function(branchs) {
        //                     branchs.forEach(function(branch) {
        //                         versions.push(branch.name);
        //                     });

        //                     return versions;
        //                 });
        //         }

        //         return versions;
        //     })

        //     .then(function(versions) {
        //         self.versions = versions = versions.sort(_.compareVersion);

        //         return self.versions;
        //     });
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

exports.type = 'github';

exports.accept = function(address, asDefault) {
    var options = _.mixin(_.mixin({}, exports.options), factory.settings.github);
    var author = options.author;
    var reg = /^github\:([0-9a-z-_]+)\/([0-9a-z-_]+)(?:@(.+?))?$/i;
    var regShort = /^([0-9a-z-_]+)\/([0-9a-z-_]+)(?:@(.+?))?$/i;
    var regShorter = /^github\:(?:([0-9a-z-_]+)\/)?([0-9a-z-_]+)(?:@(.+?))?$/i;
    var regShortest = /^(?:github\:)?(?:([0-9a-z-_]+)\/)?([0-9a-z-_]+)(?:@(.+?))?$/i;

    return reg.test(address) ||
        asDefault && regShort.test(address) ||
        author && regShorter.test(address) ||
        asDefault && author && regShortest.test(address);
};

exports.options = {
    author: 'fis-components'
};
