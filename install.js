/*
 * fis
 * http://fis.baidu.com/
 */

'use strict';

exports.name = 'install';
exports.usage = '[options] <components...>';
exports.desc = 'install components';

var logger = require('./lib/logger');
exports.register = function(commander) {

    commander
        .option('--save', 'save component(s) dependencies into `components.json` file.')
        .option('-r, --root <path>', 'set project root')
        .action(function() {
            var args = [].slice.call(arguments);
            var options = args.pop();
            var Promise = require('bluebird');
            var settings = {
                save: !!options.save,
                root: options.root || '',
                components: args.concat()
            };

            Promise

                // resolve project root.
                .try(function() {
                    if (!settings.root) {
                        var findup = require('findup');

                        return new Promise(function(resolve, reject) {
                                var fup = findup(process.cwd(), 'fis-conf.js');
                                var dir = null;

                                fup.on('found', function(found) {
                                    dir = found;
                                    fup.stop();
                                });

                                fup.on('error', reject);

                                fup.on('end', function() {
                                    resolve(dir);
                                });
                            })

                            .then(function(dir) {
                                settings.root = dir || process.cwd();
                            });
                    }
                })

                // load fis-conf.js if exists.
                .then(function() {
                    var path = require('path');
                    var exists = require('fs').existsSync;
                    var filepath =  path.join(settings.root, 'fis-conf.js');

                    if (exists(filepath)) {
                        require(filepath);

                        settings.componentsDir = path.join(settings.root, fis.config.get('componentsDir') || '/components');
                    }
                })

                // Check components.json if did not sepecified any components from command line.
                .then(function() {
                    var components = settings.components;

                    if (!components.length) {
                        var config = Promise.promisify(require('./lib/config'));
                        var path = require('path');

                        return config(path.join(settings.root, 'component.json'))

                            .then(function(ret) {
                                settings.config = ret;
                                settings.components = ret.dependencies;
                            });
                    }
                })

                // finally get components list.
                .then(function() {
                    var components = settings.components || [];

                    var factory = require('./lib/remotes/factory.js');

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

                    if (!components.length) {
                        logger.warn('Installed nothing!');
                        return;
                    }

                    var collector = require('./lib/collector.js');
                    return collector(components);
                })

                .then(function(components) {

                    // 过滤掉本地的仓库。
                    components = components.filter(function(item) {
                        return item.location !== 'local';
                    });

                    if (!components.length) {
                        console.log('Aready installed');
                        return;
                    }

                    var ProgressBar = require('progress');
                    var percentages = {};
                    var bar, ticked;
                    var update = function(name, loaded, total) {
                        percentages[name] = percentages[name] || {};
                        percentages[name].loaded = loaded;
                        percentages[name].total = total;
                        updateAll();
                    };
                    var updateAll = function() {
                        bar = bar || new ProgressBar(' download [:bar] :percent :etas', {
                            incomplete: ' ',
                            total: 100,
                            clear: true
                        });

                        var total = 0;
                        var loaded = 0;

                        Object.keys(percentages).forEach(function(key) {
                            var item = percentages[key];

                            total += item.total;
                            loaded += item.loaded;
                        });

                        var percentage = Math.round(loaded * 100 / total);
                        var intervel = percentage - ticked;
                        ticked = percentage;
                        bar.tick(Math.max(intervel, 0));
                    }

                    return Promise

                        .all(components.map(function(component) {
                            return component.install(function(percent, loaded, total) {
                                update(component.name, loaded, total);
                            });
                        }))

                        .then(function(components) {
                            var last = components.length - 1;
                            var arrs = components.map(function(item, index) {
                                return (index === last ? '└── ' : '├── ') + item.address + '@' + item.version;
                            });

                            console.log('Installed\n%s', arrs.join('\n'));
                        });
                })

                // error handle
                .error(function(e) {
                    logger.error('\x1b[31m%s\x1b[0m', e.message);
                });
        });
};