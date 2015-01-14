var _ = exports;

var ver2number = _.ver2number = function(a) {
    var m = /^v?(\d+)(?:\.(\d+))(?:\.(\d+))?$/i.exec(a);
    if (m) {
        return (m[1] << 20) + (m[2] << 10) + (m[3] || 0) << 0;
    } else {
        return 0;
    }
};

_.compareVersion = function (a, b) {
    return ver2number(b) - ver2number(a);
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