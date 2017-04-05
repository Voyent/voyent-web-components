Polymer({
	is: "voyent-registration",

    properties: {
        accountPlaceholder: { type: String },
        companyPlaceholder: { type: String },
        addressPlaceholder: { type: String },
        emailPlaceholder: { type: String },
        firstNamePlaceholder: { type: String },
        lastNamePlaceholder: { type: String },
        usernamePlaceholder: { type: String },
        passwordPlaceholder: { type: String },
        host: { type: String, notify: true, reflectToAttribute: true, value: 'dev.voyent.cloud' },
        account: { type: String, notify: true, reflectToAttribute: true },
        email: { type: String, notify: true, reflectToAttribute: true },
        username: { type: String, notify: true, reflectToAttribute: true },
        password: { type: String, notify: true },
        firstName: { type: String, notify: true, reflectToAttribute: true },
        lastName: { type: String, notify: true, reflectToAttribute: true },
        address: { type: String, notify: true, reflectToAttribute: true },
        company: { type: String, notify: true, reflectToAttribute: true },
        wizSelected: { type: Number, value: 0 },
        hideNext: { type: Boolean, value: false },
    },
    
	ready: function() {
	    var _this = this;
	    window.addEventListener('voyent-wizard-panel-previous', function(e) {
	        // Don't hide the Next button when we're back on the first pane
            _this.hideNext = false;
            
            // Also focus the Account field in the form
            setTimeout(function() {
                _this.$.account.$.input.focus();
            },100);
	    });
	    
	    window.addEventListener('voyent-wizard-panel-next', function(e) {
	        // We want to hide the Next button and replace it with our own Submit button
            _this.hideNext = true;
            
            // Also focus the First Name field in the form
            setTimeout(function() {
                _this.$.firstName.$.input.focus();
            },100);
	    });
	},
	
	checkField: function(value) {
	    return (value && value.trim().length > 0);
	},
	
	validate: function() {
	    // First check for missing required fields
	    var required = [];
	    
	    if (!this.checkField(this.account)) { required.push("Organization"); }
	    if (!this.checkField(this.company)) { required.push("Company Name"); }
	    if (!this.checkField(this.address)) { required.push("Company Address"); }
	    if (!this.checkField(this.email)) { required.push("Email"); }
	    if (!this.checkField(this.firstName)) { required.push("First Name"); }
	    if (!this.checkField(this.lastName)) { required.push("Last Name"); }
	    if (!this.checkField(this.username)) { required.push("Username"); }
	    if (!this.checkField(this.password)) { required.push("Password"); }
	    
	    if (required.length > 0) {
	        var requiredMessage = "";
	        
	        for (var i = 0; i < required.length; i++) {
	            requiredMessage += required[i];
	            
	            // If we still have more items then add a comma
	            if (i+1 !== required.length) {
	                requiredMessage += ", ";
	            }
	        }
	        
	        requiredMessage.trim();
	        
	        if (required.length === 1) {
	            requiredMessage += " is a required field but is missing.";
	        }
	        else {
	            requiredMessage += " are required fields but are missing.";
	        }
	        
	        this.fire('message-error', requiredMessage);
	    }
	    
	    // Then check for specific business cases such as length, format, etc.
	    // TODO See http://jira.icesoft.org/browse/NTFY-488 for details
	    
	    // Figure out if we're in a valid, submittable state or not
	    return required.length <= 0;
	},
	
	submitRegistration: function() {
	  // Perform validation
	  if (!this.validate()) {
	      return;
	  }
	  
	  this.fire('loading-on');
	  
	  var _this = this;
      voyent.io.admin.createAccount({
          account: this.account,
          email: this.email,
          username: this.username,
          password: this.password,
          firstname: this.firstName,
          lastname: this.lastName,
          custom: {
              address: this.address,
              company: this.company
          },
          host: this.host
      }).then(function(token) {
          _this.fire('message-info', 'Successfully registered new account');
          
          _this.fire('loading-off');
      }).catch(function(error) {
          if (error) {
              if (error.responseText) {
                  _this.fire('message-error',
                             JSON.parse(error.responseText).message + " (error code " + error.status + " " + error.statusText + ")");
              }
              else {
                  _this.fire('message-error', 'Unknown error during registration');
              }
          }
          console.error("Registration submission error: ", error);
          
          _this.fire('loading-off');
      });
	},
	
	reset: function(event) {
	    if (this.wizSelected === 0) {
            this.account = null;
            this.company = null;
            this.address = null;
            this.email = null;
            this.$.account.$.input.focus();
        }
        else if (this.wizSelected === 1) {
            this.firstName = null;
            this.lastName = null;
            this.username = null;
            this.password = null;
            this.$.firstName.$.input.focus();
        }
	},
});

