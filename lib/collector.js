/**
 * collect compoents needed.
 */

var Promise = require('bluebird');
var exports = module.exports = function(dependencies) {
    var compoents = dependencies.concat();

    return Promise

        .map(dependencies, function(remote) {
            return remote.getDependencies();
        })

        // flatten all.
        .then(function(all) {
            all.forEach(function(deps) {
                compoents.push.apply(compoents, deps);
            });

            return compoents;
        });
};