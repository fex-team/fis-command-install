

exports.accept = function(address, asDefault) {
    var reg = /^gitlab\:[0-9a-z-_]+\/[0-9a-z-_]+(?:@.+?)?$/i;
    var regShort = /^[0-9a-z-_]+\/[0-9a-z-_]+(?:@.+?)?$/i;

    return reg.test(address) || asDefault && regShort.test(address);
};