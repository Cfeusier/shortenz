var envir = require('./env');
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
var pp = require('passport');
var localStgy = require('passport-local').Strategy;
var gitHubStrategy = require('passport-github').Strategy;

/************************************************************/
// passport configuration
/************************************************************/

pp.serializeUser(function(user, done) {
  done(null, user.id);
});

pp.deserializeUser(function(id, done) {
  new User({ id: id }).fetch().then(function(user) {
    if (!user) {
      done(null, false, { message: "Invalid Username or Password" });
    } else {
      done(null, user);
    }
  });
});

pp.use(new localStgy(function(username, password, done) {
  new User({ username: username }).fetch().then(function(user) {
    if (!user) {
      return done(null, false, { message: "Invalid Username or Password" });
    }

    user.comparePassword(password, function(valid) {
      if (valid) {
        return done(null, user);
      } else {
        return done(null, false, { message: "Invalid Username or Password" });
      }
    });
  });
}));

/************************************************************/
// github oauth2 configuration
/************************************************************/

var options = {
  clientID: envir.githubClientId,
  clientSecret: envir.githubClientSecret,
  callbackURL: "http://localhost:4568/auth/github/cb"
};

var handler = function(accessToken, refreshToken, profile, done) {
  process.nextTick(function() {
    return done(null, profile);
  });
};

pp.use(new gitHubStrategy(options, handler));

/************************************************************/
// app configuration
/************************************************************/

var app = express();

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
app.use(pp.initialize());
app.use(pp.session());

/************************************************************/
// protected routes
/************************************************************/

app.get('/', util.checkUser, function(req, res) {
  res.render('index', { user: req.user });
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
  res.render('signup', { message: req.session.messages });
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
      req.session.messages = ["Username is already taken"];
      res.redirect('/signup');
    }
  });
});

app.get('/login', function(req, res) {
  res.render('login', {
    user: req.user, message: req.session.messages
  });
});

app.post('/login', function(req, res, next) {
  pp.authenticate('local', function(err, user, info) {
    if (err) return next(err);
    if (!user) {
      req.session.messages = [info.message];
      return res.redirect('/login');
    }
    req.login(user, function(err) {
      if (err) return next(err);
      util.makeSesh(req, res, user);
    });
  })(req, res, next);
});

app.get('/logout', function(req, res) {
  req.session.destroy();
  res.redirect('/');
});

app.get('/github-login', pp.authenticate('github'));

app.get('/auth/github/cb',
  pp.authenticate('github',
  { failureRedirect: '/login' }),
  function(req, res) {
    new User({ githubId: req.user.id }).fetch().then(function(user) {
      if (!user) {
        var newUser = new User({
          username: req.user.login,
          password: req.user.id
        });
        newUser.save().then(function(userObj) {
          util.makeSesh(req, res, userObj);
        });
      } else {
        util.makeSesh(req, res, user);
      }
    });
  }
);

/************************************************************/
// If all other routes fail assume the route is a short code
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
