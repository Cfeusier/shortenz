var db = require('../config');
var bcrypt = require('bcrypt-nodejs');
var Promise = require('bluebird');

var User = db.Model.extend({
  tableName: 'users',
  hasTimestamps: true,
  initialize: function(){
    this.on('creating', function(model, attrs, options) {
      bcrypt.hash(model.get('password'), null, null, function(err, hashedPass) {
        if (err) {
          return err;
        } else {
          model.set('password', hashedPass);
        }
      });
    });
  }
});

module.exports = User;