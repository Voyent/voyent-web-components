(function() {
  'use strict';

  Polymer({
    is: 'bridgeit-auth-provider',
    behaviors: [BridgeItCommonPropertiesBehavior],

    ready: function(){
      var loggedIn = bridgeit.io.auth.isLoggedIn();
      console.log('bridgeit-auth-provider.loggedIn: ' + loggedIn);
      this.loggedIn = loggedIn;
      if( loggedIn){
        this.setupTimeRemainingInterval();
      }
    },

    setupTimeRemainingInterval: function(){
      var _this = this;
      this.timeRemaining = bridgeit.io.auth.getTimeRemainingBeforeExpiry();
      this.timeRemainingBeforeExpiryInterval = setInterval(function(){
        var remaining = bridgeit.io.auth.getTimeRemainingBeforeExpiry();
        if( !remaining ){
          clearInterval(_this.timeRemainingBeforeExpiryInterval);
        }
        _this.timeRemaining = remaining;
      },1000*60);
    },

    properties: {
      loggedIn: {
        notify: true,
        reflectToAttribute: true
      },
      username: {
        notify: true,
        value: function(){
          return bridgeit.io.auth.getLastKnownUsername();
        }
      },
      usePushService: {
        type: Boolean,
        value: false,
        notify: true
      },
      error: {
        notify: true,
        type: String,
        reflectToAttribute: true
      },
      authResponse: {
        notify: true,
        type: String
      },
      timeRemaining: {
        notify: true,
        type: Number
      },
      timeRemainingBeforeExpiryInterval: {
        type: Number
      }
    },

    listeners: {
      'doLogin': 'login'
    },

    login: function(username, password, admin){
      console.log('bridgeit-auth-provider.login()');
      var _this = this;
      if( username ){
        this.username = username;
      }
      if( !this.username ){
        this.error = 'Missing username';
        return;
      }
      if( !password ){
        this.error = 'Missing password';
        return;
      }
      this.error = '';
      var params = {
        account: this.account,
        username: this.username,
        password: password,
        host: this.host,
        usePushService: this.usePushService
      };
      if( !admin ){
        params.realm = this.realm;
      }
      return bridgeit.io.auth.connect(params).then(function(authResponse){ //jshint ignore:line
        _this.authResponse = authResponse;
        bridgeit.io.setCurrentRealm(_this.realm);
        _this.accessToken = bridgeit.io.auth.getLastAccessToken();
        _this.loggedIn = true;
        _this.fire('onAfterLogin');
        _this.setupTimeRemainingInterval();
      }).catch(function(error){
        _this.error = error.responseText || error.message;
        console.log('bridgeit-auth-provider#login() error');
        _this.fire('bridgeit-error', {error: Error('Failed login: ' + this.error)});
      });
    },
    logout: function(){
      bridgeit.io.auth.disconnect();
      this.loggedIn = false;
      this.accessToken = null;
      this.timeRemaining = 0;
    }
  });
})();