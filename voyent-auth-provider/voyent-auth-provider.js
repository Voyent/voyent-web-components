(function() {
  'use strict';

  Polymer({
    is: 'voyent-auth-provider',
    behaviors: [VoyentCommonPropertiesBehavior],

    ready: function() {
      this.loggedIn = voyent.auth.isLoggedIn();
      console.log('voyent-auth-provider.loggedIn: ' + this.loggedIn);
      if (this.loggedIn) {
        /* check connect settings */
        var connectSettings = voyent.auth.getConnectSettings();
        if (!connectSettings) {
          connectSettings = {};
        }
        connectSettings.account = this.account;
        connectSettings.username = this.username;
        connectSettings.password = this.password;
        connectSettings.host = this.host;
        connectSettings.usePushService = this.usePushService;
        connectSettings.admin = this.admin;
        connectSettings.scopeToPath = this.scopeToPath;
        connectSettings.onSessionExpiry = this.onSessionExpiry;
        if (this.timeout) {
          connectSettings.connectionTimeout = this.timeout;
        }
        if (!this.admin) {
          connectSettings.realm = this.realm;
        }
        voyent.auth.connect(connectSettings);
      }
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
        value: function() {
          return voyent.auth.getLastKnownUsername();
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
      },

      /**
       *  If set, the authentication token will be restricted to the given path, unless in development mode. Eg. the current token
       *  will be valid for any URL paths beginning with '/myapp', such as '/myapp/page1', etc.
       *  @default '/'
       */
      scopeToPath: {
        type: String,
        notify: true
      }
    },

    listeners: {
      'doLogin': 'login'
    },

    /**
     * Attempts to authenticate. If the username, password and admin flag are not passed in, the bound component values will be used.
     * After the login is successful, the onAfterLogin event is then fired.
     * @return {Promise} A promise with the response from voyent.auth.connect()
     */
    login: function(username, password, admin) {
      this.set('error', '');
      var _this = this;
      if (username) {
        this.username = username;
      }
      if (!this.username) {
        this.set('error', 'Missing username');
        return Promise.reject(this.error);
      }
      if (password) {
        this.password = password;
      }
      if (!this.password) {
        this.set('error', 'Missing password');
        return Promise.reject(this.error);
      }

      if (!this.realm) {
        this.set('error', 'Missing realm');
        return Promise.reject(this.error);
      }

      if (admin) {
        this.admin = admin;
      }
      var params = {
        account: this.account,
        username: this.username,
        password: this.password,
        host: this.host,
        usePushService: this.usePushService,
        admin: this.admin,
        onSessionExpiry: this.onSessionExpiry,
        scopeToPath: this.scopeToPath
      };
      if (this.timeout) {
        params.connectionTimeout = this.timeout;
      }
      if (!admin) {
        params.realm = this.realm;
      }

      function onAfterConnect(authResponse) {
        _this.authResponse = authResponse;
        voyent.setCurrentRealm(_this.realm);
        _this.accessToken = voyent.auth.getLastAccessToken();
        _this.loggedIn = true;
        _this.fire('onAfterLogin');
      }

      return voyent.auth.connect(params).then(function(authResponse) { //jshint ignore:line
        onAfterConnect(authResponse);
      }).catch(function(error) {
        _this.set('error', 'Login failed ' + JSON.parse(error.responseText).message || error.responseText);

        //if fallbackToAdmin try to login as admin
        if (!_this.admin && _this.fallbackToAdmin) {
          params.realm = 'admin';
          return voyent.auth.connect(params).then(function(authResponse) { //jshint ignore:line
            onAfterConnect(authResponse);
          });
        }
        else{
          Promise.reject(error);
        }
      }).catch(function(error) {
        _this.set('error', 'Login failed ' + JSON.parse(error.responseText).message || error.responseText);
      });
    },

    /**
     * Log out the current user and clear all credential and authentication information.
     */
    logout: function() {
      voyent.auth.disconnect();
      this.loggedIn = false;
      this.accessToken = null;
      this.fire('voyent-session-disconnected');
    },

    /**
     * Fired when the current session expired.
     * @private
     */
    onSessionExpiry: function() {
      //'this' is not the component context during the callback
      var _this = document.querySelector('voyent-auth-provider');
      _this.loggedIn = false;
      _this.accessToken = null;
      _this.fire('voyent-session-expired');
    }
  });
})();
