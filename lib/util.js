var _ = exports;
var semver = require('semver');

// var ver2number = _.ver2number = function(a) {
//     var m = /^v?(\d+)(?:\D(\d+))(?:\D(\d+))?(?:\D+(\d+))?/i.exec(a);
//     if (m) {
//         return parseInt(m[1], 10) * (1 << 10) +
//           parseInt(m[2], 10) * (1 << 9) +
//           parseInt(m[3] || 0, 10) * (1 << 8) +
//           parseInt(m[4] || 0, 10);
//     } else {
//         return 0;
//     }
// };

_.compareVersion = function (a, b) {
    if (semver.valid(a) && semver.valid(b)) {
      return semver.compare(b, a);
    } else if (semver.valid(b)) {
      return 1;
    } else if (semver.valid(a)) {
      return -1;
    } else {

      // 提高 master 的优先级。
      if (a === 'master' && b !== 'master') {
        return -1;
      } else if (a !== 'master' && b === 'master') {
        return 1;
      }

      return 0;
    }
};

_.indexOfArray = function(key, val, list) {
    var found = -1;
    list.every(function(item, index) {
        if (item[key] == val) {
            found = index;
            return false;
        }
        return true;
    });

    return found;
};

_.mixin = function mixin(a, b) {
    if (a && b) {
        for (var key in b) {
            a[key] = b[key];
        }
    }
    return a;
};
