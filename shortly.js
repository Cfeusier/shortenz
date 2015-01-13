var express = require('express');
var util = require('./lib/utility');
var partials = require('express-partials');
var bodyParser = require('body-parser');

var db = require('./app/config');
var Users = require('./app/collections/users');
var User = require('./app/models/user');
var Links = require('./app/collections/links');
var Link = require('./app/models/link');
var Click = require('./app/models/click');
var session = require('express-session');

var app = express();

/************************************************************/
// app configuration
/************************************************************/

app.set('views', __dirname + '/views');
app.set('view engine', 'ejs');
app.use(partials());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(__dirname + '/public'));
app.use(session({
  secret: 'you so sneaky',
  resave: false,
  saveUninitialized: true
}));

/************************************************************/
// protected routes
/************************************************************/

app.get('/', util.checkUser, function(req, res) {
  res.render('index');
});

app.get('/create', util.checkUser, function(req, res) {
  res.render('index');
});

app.get('/links', util.checkUser, function(req, res) {
  Links.reset().fetch().then(function(links) {
    res.send(200, links.models);
  });
});

app.post('/links', util.checkUser, function(req, res) {
  var uri = req.body.url;

  if (!util.isValidUrl(uri)) {
    console.log('Not a valid url: ', uri);
    return res.send(404);
  }

  new Link({ url: uri }).fetch().then(function(found) {
    if (found) {
      res.send(200, found.attributes);
    } else {
      util.getUrlTitle(uri, function(err, title) {
        if (err) {
          console.log('Error reading URL heading: ', err);
          return res.send(404);
        }

        var link = new Link({
          url: uri,
          title: title,
          base_url: req.headers.origin
        });

        link.save().then(function(newLink) {
          Links.add(newLink);
          res.send(200, newLink);
        });
      });
    }
  });
});

/************************************************************/
// authentication routes
/************************************************************/

app.get('/signup', function(req, res) {
  res.render('signup');
});

app.post('/signup', function(req, res) {
  var username = req.body.username;
  var password = req.body.password;

  new User({ username: username }).fetch().then(function(user) {
    if (!user) {
      var newUser = new User({
        username: username,
        password: password
      });
      newUser.save().then(function(userObj) {
        util.makeSesh(req, res, userObj);
      });
    } else {
      console.log("already an account with that username");
      res.redirect('/signup');
    }
  });
});

app.get('/login', function(req, res) {
  res.render('login')
});

app.post('/login', function(req, res) {
  var username = req.body.username;
  var strPass = req.body.password;

  new User({ username: username }).fetch().then(function(user) {
    if (!user) {
      return res.redirect('/login');
    }
    user.comparePassword(strPass, function(valid) {
      if (valid) {
        util.makeSesh(req, res, user);
      } else {
        res.redirect('/login');
      }
    });
  });
});

app.get('/logout', function(req, res) {
  if (util.currentUser(req, res)) req.session.destroy();
  res.redirect('login');
});

/************************************************************/
// Iif all other routes fail assume the route is a short code
// and try and handle it here.
// If the short-code doesn't exist, send the user to '/'
/************************************************************/

app.get('/*', function(req, res) {
  new Link({ code: req.params[0] }).fetch().then(function(link) {
    if (!link) {
      res.redirect('/');
    } else {
      var click = new Click({ link_id: link.get('id') });

      click.save().then(function() {
        db.knex('urls').where('code', '=', link.get('code')).update({
          visits: link.get('visits') + 1,
        }).then(function() {
          return res.redirect(link.get('url'));
        });
      });
    }
  });
});

console.log('Shortly is listening on 4568');
app.listen(4568);
