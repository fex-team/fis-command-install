var request = require('request');
var Promise = require('bluebird');
var Remote = require('./remote.js');
var _ = require('../util.js');
var factory = require('./factory.js');
var path = require('path');
var fs = require('fs');
var zlib = require('zlib');
var tar = require('tar');
var DEFAULT_TOKEN = 'XsYDeyqyFD777qgovh15';

function requestAPI(uri, token, callback) {
  var request = require('request');

  request({
    uri: uri,
    json: true,
    headers: {
      'User-Agent': 'request',
      'PRIVATE-TOKEN': token || DEFAULT_TOKEN
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

var spawn = require('child_process').spawn;

function exec(command, callback) {
  // console.log(command);
  var args = command.split(/\s+/);
  var child = spawn(args.shift(), args);
  var output = '';

  child.stdout.on('data', function(chunk) {
    output += chunk.toString('utf-8');
  });

  child.on('exit', function() {
    callback(null, output);
  });

  child.on('error', function(e) {
    callback(e)
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
  this.domain = options.domain;
  this.address = this.author + '/' + this.name;
  var version = this._versionRaw = RegExp.$3;
  this._version = version === 'latest' ? '*' : version || '*';
  this.tagsmap = {};

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
        if (options.downloadGitlabFromSvn) {
          return Promise.promisify(exec)
            ('svn cat https://svn.baidu.com/febase/trunk/fis/fis-components/' + self.address + '/' + self.version + '/component.json')
            .then(function(body) {
              return JSON.parse(body.trim());
            });
        } else {
          var request = Promise.promisify(requestAPI);
          var projectId = encodeURIComponent(self.address);

          return request(self.domain + 'api/v3/projects/' + projectId + '/repository/blobs/' + (self.tagsmap[self.version] || self.version) + '?filepath=component.json', options.token);
        }
      })

      .error(function(e) {
        if (/Not\sFound/i.test(e.message)) {
          throw new Error('`gitlab:' + self.address + '` not found.');
        } else {
          throw new Error(e + ' while loading gitlab:' + self.domain + self.address);
        }
      })

      .then(function(body) {
        self.config = body;

        if (!body || !body.name) {
          throw new Error('`gitlab:' + self.address + '` is an invalid component, please check this out [https://github.com/fis-components/spec].');
        }

        return self.config;
      });
    });
  };

  // get remote repos tags and branches.
  this.getAvaiableVersions = function() {
    if (this.versions) {
      return Promise.resolve(this.versions);
    }

    var self = this;
    var versions = [];


    if (options.downloadGitlabFromSvn) {
      return Promise.promisify(exec)('svn cat https://svn.baidu.com/febase/trunk/fis/fis-components/' + self.address + '/versions.txt')
        .then(function(body) {
          versions = body.trim().split(/[\r\n]+/);
          self.versions = versions.sort(_.compareVersion);
          return self.versions;
        })
    }

    var request = Promise.promisify(requestAPI);
    var projectId = encodeURIComponent(this.address);

    return request(self.domain + 'api/v3/projects/' + projectId + '/repository/tags', options.token)

    .then(function(tags) {
      tags.forEach(function(tag) {
        self.tagsmap[tag.name] = tag.commit.id;
        versions.push(tag.name);
      });


      // no tags? now branchs.
      // if (!versions.length) {
      return request(self.domain + 'api/v3/projects/' + projectId + '/repository/branches', options.token)

      .then(function(branchs) {
        branchs.forEach(function(branch) {
          versions.push(branch.name);
        });

        return versions;
      });
      // }
      // return versions;
    })

    .then(function(versions) {
      self.versions = versions = versions.sort(_.compareVersion);
      return self.versions;
    });
  };

  this.install = function(progress) {
    var self = this;
    var Scaffold = require('fis-scaffold-kernel');
    // download from gitlab
    var scaffold = new Scaffold({
      type: 'gitlab',
      repos: self.domain,
      log: {
        level: 0
      }
    });

    if (options.downloadGitlabFromSvn) {
      var filename = fis.util.md5(self.address);
      var tmp_file_path = fis.project.getTempPath('downloads', 'file_' + filename);
      if (fis.util.exists(tmp_file_path)) {
        fis.util.del(tmp_file_path);
      }
      var tmp_path = fis.project.getTempPath('downloads', filename);
      if (fis.util.exists(tmp_path)) {
        fis.util.del(tmp_path);
      }
      return new Promise(function(resolve, reject) {
        exec('svn export https://svn.baidu.com/febase/trunk/fis/fis-components/' + self.address + '/' + self.version + '/all.tar.gz ' + tmp_file_path, function(error, body) {
          if (error) {
            return reject(error);
          }

          fs.createReadStream(tmp_file_path)
            .pipe(zlib.createGunzip())
            .pipe(tar.Extract({
              path: tmp_path
            }))
            .on('error', reject)
            .on('end', function() {
              var files = fs.readdirSync(tmp_path);
              var location = tmp_path;
              self.convert(location);

              var target = path.join(factory.settings.componentsDir, self.name);
              var mapping = self.config.mapping || [];

              if (mapping.length) {
                mapping.unshift({
                  reg: /^\/component.json$/i,
                  release: '$0'
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
            });
        });
      });
    }

    return new Promise(function(resolve, reject) {

      scaffold.download(self.address + '@' + self.version, function(error, location) {

        if (error) {
          return reject(error);
        }

        self.convert(location);

        var target = path.join(factory.settings.componentsDir, self.name);
        var mapping = self.config.mapping || [];

        if (mapping.length) {
          mapping.unshift({
            reg: /^\/component.json$/i,
            release: '$0'
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
      }, progress, {
        token: options.token
      });
    });
  };
};

exports.type = 'gitlab';

exports.accept = function(address, asDefault) {
  var options = _.mixin(_.mixin({}, exports.options), factory.settings.gitlab);
  var author = options.author;
  var reg = /^gitlab\:([0-9a-z\.\-_]+)\/([0-9a-z\.\-_]+)(?:@(.+?))?$/i;
  var regShort = /^([0-9a-z\.\-_]+)\/([0-9a-z\.\-_]+)(?:@(.+?))?$/i;
  var regShorter = /^gitlab\:(?:([0-9a-z\.\-_]+)\/)?([0-9a-z\.\-_]+)(?:@(.+?))?$/i;
  var regShortest = /^(?:gitlab\:)?(?:([0-9a-z\.\-_]+)\/)?([0-9a-z\.\-_]+)(?:@(.+?))?$/i;

  return reg.test(address) ||
    asDefault && regShort.test(address) ||
    author && regShorter.test(address) ||
    asDefault && author && regShortest.test(address);
};

exports.options = {
  author: 'fis-components',
  domain: 'http://gitlab.baidu.com/'
};
