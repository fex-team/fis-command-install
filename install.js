/*
 * fis
 * http://fis.baidu.com/
 */

'use strict';

exports.name = 'install';
exports.usage = '<names> [options]';
exports.desc = 'install components and demos';
exports.register = function(commander){
    
    commander
        .option('--repos <url>', 'repository', String)
        .action(function(names, options){
            var remote = options.repos || fis.config.get(
                'system.repos',
                fis.project.DEFAULT_REMOTE_REPOS
            ).replace(/^\/$/, '') + '/component';
            var opt = {
                extract : process.cwd(),
                remote : remote
            };
            names.split(/,/).forEach(function(name){
                name = name.split('@');
                fis.util.install(name[0], name[1], opt);
            });
        });
};