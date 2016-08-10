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
        preview: { type: Boolean, value: false, notify: true }
    },

    ready: function() {
        // First check if we're in Preview mode
        // If we are we'll try to get a set of URL parameters:
        //  id, realm, account, access_token
        // Then if the params are present we'll try to get the desired email template by ID from the doc service
        // If successful that HTML content will rewrite over our page
        if (this.preview) {
            this.fire('message-info', 'Email editor preview mode detected, attempting to load...');
            
            var params = this._getURLParams();
            
            if (!this._hasURLParam(params, "id")) { this.fire('message-error', 'Missing "id" param'); return; }
            if (!this._hasURLParam(params, "realm")) { this.fire('message-error', 'Missing "realm" param'); return; }
            if (!this._hasURLParam(params, "account")) { this.fire('message-error', 'Missing "account" param'); return; }
            if (!this._hasURLParam(params, "access_token")) { this.fire('message-error', 'Missing "access_token" param'); return; }
            
            var _document = document;
            var _this = this;
            voyent.io.documents.getDocument({'realm': params.realm, 'account': params.account, 'accessToken': params.access_token,
                                             'id': params.id}).then(function(doc) {
                _this.fire('message-info', 'Successfully found email template to display');
                
                _document.write(doc.content);
                _document.close();
            });
        }
        else {
            this.hasPreviewURL = false;
            this.previewURL = null;
            
            this.set('_savedEmails', []);
            
            this.initialize();
        }
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
                _this.resetPreviewURL();
                
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
        this.resetPreviewURL();
    },
    
    resetPreviewURL: function() {
        this.set('hasPreviewURL', false);
        this.set('previewURL', null);
    },
    
    saveEmail: function() {
        this._saveEmail(function() { });
    },
    
    previewEmail: function() {
        var _this = this;
        this._saveEmail(function() {
            _this.set('hasPreviewURL', true);
            _this.set('previewURL', 'preview.html?id=' + _this.currentEmailId +
                                    '&realm=' + _this.realm +
                                    '&account=' + _this.account +
                                    '&access_token=' + voyent.io.auth.getLastAccessToken());
        });
    },
    
    _saveEmail: function(cb) {
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
            
            if (cb) { cb(); }
        }).catch(function(error) {
            voyent.io.documents.createDocument(toPass).then(function(){
                _this.fire('message-info', 'Successfully saved email template "' + _this.currentEmailId + '".');
                
                if (cb) { cb(); }
            }).catch(function(error) {
                _this.fire('message-error', 'Failed to save email template "' + _this.currentEmailId + '".');
            });
        });
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
    
    _getURLParams: function() {
        var params = {};
        var parts = window.location.href.replace(/[?&]+([^=&]+)=([^&]*)/gi, function(m,key,value) {
            params[key] = value;
        });
        return params;
    },
    
    _hasURLParam: function(params, key) {
        return typeof params[key] !== 'undefined' && params[key] !== null;
    },
});