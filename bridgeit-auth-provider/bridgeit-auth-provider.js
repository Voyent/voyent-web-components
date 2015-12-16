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

      /**
       * Flag for the current logged-in status.
       */
      loggedIn: {
        notify: true,
        reflectToAttribute: true
      },

      /**
       * The username parameter, which can be declaratively bound or passed in directly through the 'login' function.
       */
      username: {
        notify: true,
        value: function(){
          return bridgeit.io.auth.getLastKnownUsername();
        }
      },

      /**
       * If true, will start the push service after authentication and refresh the push credentials when the access token
       * is refreshed.
       * @default false
       */
      usePushService: {
        type: Boolean,
        value: false,
        notify: true
      },

      /**
       * The current error string for the last authentication attempt.
       */
      error: {
        notify: true,
        type: String,
        reflectToAttribute: true
      },

      /**
       * The last HTTP response from the authentication service.
       */
      authResponse: {
        notify: true,
        type: String
      },

      /**
       * The time remaining in ms before the current token expires.
       */
      timeRemaining: {
        notify: true,
        type: Number
      },

      /**
       * Interval period to update the time remaining property.
       */
      timeRemainingBeforeExpiryInterval: {
        type: Number
      },

      /**
       * The timeout, in minutes, of inactivity before the component will stop automatically refreshing the access token.
       * @default 20
       */
      timeout: {
        type: Number,
        notify: true
      },

      /**
       * Whether to login in as an account administrator, or as a realm user.
       * @default false
       */
      admin: {
        type: Boolean,
        notify: true
      },

      /**
       * Flag to instruct the component to attempt to login as an admin, if logging into the realm has failed. This may be useful for login 
       * forms intended for both normal users and admins.
       * @default false
       */
      fallbackToAdmin: {
        type: Boolean
      }
    },

    listeners: {
      'doLogin': 'login'
    },

    /**
     * Attempts to authenticate. If the username, password and admin flag are not passed in, the bound component values will be used. 
     * After the login is successful, the onAfterLogin event is then fired. If the login attempt is not successful, a bridgeit-error 
     * event will be fired. A bridgeit-session-expired event will be fired when the session expires.
     * @return {Promise} A promise with the response from bridgeit.io.auth.connect()
     */
    login: function(username, password, admin){
      console.log('bridgeit-auth-provider.login()');
      var _this = this;
      if( username ){
        this.username = username;
      }
      if( !this.username ){
        this.error = 'Missing username';
        return Promise.reject(this.error);
      }
      if( password ){
        this.password = password;
      }
      if( !this.password ){
        this.error = 'Missing password';
        return Promise.reject(this.error);
      }
      if( admin ){
        this.admin = admin;
      }
      this.error = '';
      var params = {
        account: this.account,
        username: this.username,
        password: this.password,
        host: this.host,
        usePushService: this.usePushService,
        onSessionExpiry: this.onSessionExpiry,
        admin: this.admin
      };
      if( this.timeout ){
        params.connectionTimeout = this.timeout;
      }
      if( !admin ){
        params.realm = this.realm;
      }

      function onAfterConnect(authResponse){
        _this.authResponse = authResponse;
        bridgeit.io.setCurrentRealm(_this.realm);
        _this.accessToken = bridgeit.io.auth.getLastAccessToken();
        _this.loggedIn = true;
        _this.fire('onAfterLogin');
        _this.setupTimeRemainingInterval();
      }

      return bridgeit.io.auth.connect(params).then(function(authResponse){ //jshint ignore:line
        onAfterConnect(authResponse);
      }).catch(function(error){

        //if fallbackToAdmin try to login as admin
        if( !_this.admin && _this.fallbackToAdmin ){
          params.realm = 'admin';
          return bridgeit.io.auth.connect(params).then(function(authResponse){ //jshint ignore:line
            onAfterConnect(authResponse);
          });
        }
        else{
          Promise.reject(error);
        }
        _
      }).catch(function(error){
        this.error = error.responseText || error.message;
        console.log('bridgeit-auth-provider#login() error');
        _this.fire('bridgeit-error', {error: Error('Failed login: ' + this.error)});
      });
    },

    /**
     * Log out the current user and clear all credential and authentication information.
     */
    logout: function(){
      bridgeit.io.auth.disconnect();
      this.loggedIn = false;
      this.accessToken = null;
      this.timeRemaining = 0;
    },

    /** 
     * Fired when the current session expired.
     * @private
     */
    onSessionExpiry: function(){
      this.fire('bridgeit-session-expired');
    }
  });
})();