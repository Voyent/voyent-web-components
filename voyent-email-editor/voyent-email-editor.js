var Voyent = Voyent || {};

Voyent.CodeEditor = Polymer({
    is: "voyent-email-editor",

    properties: {
        /**
         * Defines the Voyent account of the realm.
         * @default voyent.io.auth.getLastKnownAccount()
         */
        account: { type: String },
        /**
         * Defines the Voyent realm to build actions for.
         * @default voyent.io.auth.getLastKnownRealm()
         */
        realm: { type: String },
        /**
         * Selected index of the saved actions dropdown
         */
        selectedIndex: { type: Number, notify: true },
        /**
         * Name or ID of the current email template
         */
        currentEmailId: { type: String, value: 'defaultEmail' },
        /**
         * Document ID storing an index of our saved email templates
         */
        indexDocId: { type: String, value: 'emailTemplates', notify: true },
        /**
         * Value of the currently used email template
         */
        emailValue: { type: String, value: "" },
    },

    ready: function() {
        this.set('_savedEmails', []);
        
        this.initialize();
    },
    
    initialize: function() {
        if (!this.realm) {
            this.realm = voyent.io.auth.getLastKnownRealm();
        }
        if (!this.account) {
            this.account = voyent.io.auth.getLastKnownAccount();
        }
        if (!voyent.io.auth.isLoggedIn()) {
            return;
        }
        
        this._getIndex();
    },
    
    loadEmail: function() {
        if (typeof this.selectedIndex !== 'undefined' && this.selectedIndex !== null) {
            // Get the ID from our index
            var toLoadId = this._savedEmails[this.selectedIndex];
            var _this = this;
            voyent.io.documents.getDocument({'realm': this.realm, 'account': this.account,
                                             'id': toLoadId}).then(function(doc) {
                _this.set('emailValue', doc.content);
                _this.set('currentEmailId', toLoadId);
                
                _this.fire('message-info', 'Successfully loaded "' + toLoadId + '" with ' + _this.emailValue.length + ' characters.');
            }).catch(function(error) {
                _this.fire('message-error', 'Failed to load the email template "' + toLoadId + '".');
            });
        }
        else {
            this.fire('message-error', 'Please select an email template to load');
        }
    },
    
    deleteEmail: function() {
        if (typeof this.selectedIndex !== 'undefined' && this.selectedIndex !== null) {
            // Get the ID from our index
            var toDeleteId = this._savedEmails[this.selectedIndex];
            
            // Confirm with the user that we want to delete the email template
            var confirm = window.confirm('Are you sure you want to delete the "' + toDeleteId + '" email template?');
            if (!confirm) {
                return;
            }
            
            // Try to remove the email template from our index doc, and update accordingly
            var index = this._savedEmails.indexOf(toDeleteId);
            if (index > -1) {
                this.splice('_savedEmails', index, 1);
                this._updateIndex();
            }
            
            // Delete the email template document itself
            var _this = this;
            voyent.io.documents.deleteDocument({'realm': this.realm, 'account': this.account,
                                                'id': toDeleteId}).then(function(s) {
                _this.newEmail(); // Reset our editor state
                
                _this.fire('message-info', 'Successfully deleted the email template "' + toDeleteId + '".');
            }).catch(function(error) {
                _this.fire('message-error', 'Failed to delete the email template "' + toDeleteId + '".');
            });
        }
        else {
            this.fire('message-error', 'Please select an email template to delete');
        }
    },
    
    newEmail: function() {
        this.set('currentEmailId', 'newEmail');
        this.set('emailValue', '');
        this.set('selectedIndex', null);
    },
    
    saveEmail: function() {
        // Check to see if this ID is already in our doc index. If not we'll need to push and update the index
        if (this._savedEmails.indexOf(this.currentEmailId) === -1) {
            this.push('_savedEmails', this.currentEmailId);
            this._updateIndex();
        }
        
        // First we try updating the document, and if that fails we try creating instead
        var _this = this;
        var toPass = {'realm': this.realm, 'account': this.account,
                      'id': this.currentEmailId, 'document': { 'content': this.emailValue } };
        
        voyent.io.documents.updateDocument(toPass).then(function(){
            _this.fire('message-info', 'Successfully saved email template "' + _this.currentEmailId + '".');
        }).catch(function(error) {
            voyent.io.documents.createDocument(toPass).then(function(){
                _this.fire('message-info', 'Successfully saved email template "' + _this.currentEmailId + '".');
            }).catch(function(error) {
                _this.fire('message-error', 'Failed to save email template "' + _this.currentEmailId + '".');
            });
        });
    },
    
    previewEmail: function() {
        this.saveEmail();
        
        // TODO Show the HTML content of this.emailValue in an iframe or new window. Need to callback from saveEmail though
    },
    
    _getIndex: function() {
        this.set('_savedEmails', []);
        
        var _this = this;
        voyent.io.documents.getDocument({'realm': this.realm, 'account': this.account,
                                         'id': this.indexDocId}).then(function(doc) {
            _this.set('_savedEmails', doc.ids);
        });
    },
    
    _updateIndex: function() {
        var _this = this;
        var toPass = {'realm': this.realm, 'account': this.account,
                      'id': this.indexDocId, 'document': { 'ids': this._savedEmails } };
        
        // Attempt to update our doc list first, and failing that create it instead
        voyent.io.documents.updateDocument(toPass).then(function(){
        }).catch(function(error) {
            voyent.io.documents.createDocument(toPass);
        });
    },
});