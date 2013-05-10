/*
 * fis
 * http://fis.baidu.com/
 */

'use strict';

exports.name = 'install';
exports.usage = '<name> [options]';
exports.desc = 'install components from remote repository';
exports.register = function(commander){
    var defaultRepos = fis.config.get(
        'system.repos',
        fis.project.DEFAULT_REMOTE_REPOS
    ).replace(/^\/$/, '') + '/component';
    
    function install(name, version, extract, remote){
        version = version === '*' ? 'latest' : ( version || 'latest' );
        var url = remote + '/' + name + '/' + version + '.tar';
        process.stdout.write('install component [' + name + '@' + version + '] ... ');
        fis.util.download(url, function(err){
            if(err){
                process.stdout.write('fail\n');
                fis.log.error( 'unable to download component [' +
                    name + '@' + version + '] from [' + url + '], error [' + err + ']');
            } else {
                process.stdout.write('ok\n');
                var pkg = fis.util(extract, 'package.json');
                if(fis.util.isFile(pkg)){
                    var info = fis.util.readJSON(pkg);
                    fis.util.fs.unlinkSync(pkg);
                    fis.util.map(info.dependencies || {}, function(name, version){
                        install(name, version, extract, remote);
                    });
                }
            }
        }, extract);
    }
    
    commander
        .option('-r, --repos <url>', 'repository', String, defaultRepos)
        .action(function(name, options){
            name = name.split('@');
            var repos = options.repos.replace(/^\/$/, '');
            install(name[0], name[1], process.cwd(), repos);
        });
};