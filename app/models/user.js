var db = require('../config');
var bcrypt = require('bcrypt-nodejs');
var Promise = require('bluebird');

var User = db.Model.extend({
  tableName: 'users',
  hasTimestamps: true,
  initialize: function() {
    this.on('creating', this.hashPassword);
  },
  comparePassword: function(password, cb) {
    bcrypt.compare(password, this.get('password'), function(err, valid) {
      cb(valid);
    });
  },
  hashPassword: function() {
    var hashFunc = Promise.promisify(bcrypt.hash);

    return hashFunc(this.get('password'), null, null).bind(this)
             .then(this.updatePassword.bind(this));
  },
  updatePassword: function(newPassword) {
    this.set('password', newPassword);
  }
});

module.exports = User;