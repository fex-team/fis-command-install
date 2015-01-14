var util = require('util');

function wrap(fn) {

    return function() {
        var msg = util.format.apply(util, arguments);
        return fn.call(this, msg);
    }
}

exports.debug = wrap(fis.log.debug);
exports.log = exports.notice = wrap(fis.log.notice);
exports.warn = exports.warning = wrap(fis.log.warning);
exports.error = wrap(fis.log.error);