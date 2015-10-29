(function() {
  'use strict';

  Polymer({
    is: 'bridgeit-login-paper-card',

    behaviors: [
      Polymer.IronFormElementBehavior,
      Polymer.IronValidatableBehavior
    ],

    properties: {
      heading: {
        notify: true,
        type: String,
      },
      username: {
        notify: true,
        type: String
      },
      password: {
        notify: true,
        type: String
      },
      visible: {
        notify: true,
        type: Boolean
      },
      error: {
        notify: true,
        type: String
      },
      authProvider: {
        notify: true,
        type: String
      },
      submitLabel: {
        notify: true,
        type: String
      },
      cancelLabel: {
        notify: true,
        type: String
      }
    },

    handleLogin: function(e){
      var _this = this;
      console.log('login-view.handleLogin() ' + this.username + ', ' + this.password);
      var authProvider = document.querySelector('#' + this.authProvider);
      if( !authProvider ){
        console.error('bridgeit-login-paper-card could not find auth-provider: ' + this.authProvider);
        return;
      }
      this.$$('#loginSpinner').active = true;
      authProvider.login(this.username, this.password).then(function(){
        //clear password
        _this.password = '';
        _this.$$('#loginSpinner').active = false;
      }).catch(function(){
        _this.$$('#loginSpinner').active = false;
      });
      e.preventDefault();
    },

    _clearPassword: function(){
      this.password = '';
    },

    _clearUsername: function(){
      this.username = '';
    },

    // Overidden from Polymer.IronValidatableBehavior. Will set the `invalid`
    // attribute automatically, which should be used for styling.
    _getValidity: function() {
      return !!this.password && !!this.username;
    },

    cancel: function(){
      this.username = '';
      this.password = '';
    }
    
  });
})();