var BridgeIt = BridgeIt || {};

BridgeIt.CodeEditor = Polymer({
    is: "bridgeit-code-editor",

    properties: {
        /**
         * The size of the font (in pixels) for the editor text.
         */
        fontsize: { type: Number, value: 12, observer: '_fontsizeChanged' },
        /**
         * Whether to use hard tabs for the tab character. Hard tabs means you're using tab characters instead of spaces.
         */
        hardtabs: { type: Boolean, value: false, observer: '_hardtabsChanged' },
        /**
         * The programming language mode, see here for a list of available options: https://github.com/ajaxorg/ace/tree/master/lib/ace/mode.
         */
        mode: { type: String, value: 'javascript', observer: '_modeChanged' },
        /**
         * Whether to set the input mode to overwrite. If enabled any text you enter will type over any text after it.
         */
        overwrite: { type: Boolean, value: false, observer: '_overwriteChanged' },
        /**
         * Whether to set use read-only mode. If enabled none of the content can change.
         */
        readonly: { type: Boolean, value: false, observer: '_readonlyChanged' },
        /**
         * Whether to disable syntax validation. More info here: https://github.com/ajaxorg/ace/wiki/Syntax-validation.
         */
        disablevalidation: { type: Boolean, value: false, observer: '_disablevalidationChanged' },
        /**
         * The number of spaces that define a soft tab. This attribute is only relevant when `hardtabs` is false.
         */
        tabsize: { type: Number, value: 4, observer: '_tabsizeChanged' },
        /**
         * The theme, see here for a list of available options: https://github.com/ajaxorg/ace/tree/master/lib/ace/theme.
         */
        theme: { type: String, value: 'textmate', observer: '_themeChanged' },
        /**
         * The current value of the code editor. Data binding is enabled for this attribute.
         */
        value: { type: String,  observer: '_valueChanged', notify: true }
    },

    ready: function() {
        var _this = this;
        var codeEditorURL = this.resolveUrl('../common/ace-import.html');
        //load missing ace-editor dependency
        if (!('ace' in window)) {
            _this.importHref(codeEditorURL, function(e) {
                document.head.appendChild(document.importNode(e.target.import.body,true));
                initialize();
            }, function(err) {
                console.error('bridgeit-code-editor: error loading ace editor dependency', err);
            });
        }
        else { initialize(); }

        function initialize() {
            //initialize editor
            _this.editor = ace.edit(_this.$.editor);
            //set some static defaults
            _this.editor.setShowPrintMargin(false);
            _this.editor.$blockScrolling = Infinity; //disable console warning
            //set default properties
            _this._setProperties();
            //add any listeners
            _this._addListeners();
            //setup resizable corner
            _this._setupResizable();
        }
    },


    //******************PRIVATE API******************

    _setProperties: function() {
        var session = this.editor.getSession();

        if (this.fontsize && typeof this.fontsize==='number' && (this.fontsize%1) === 0) {
            this.editor.setFontSize(this.fontsize);
        }
        if (this.hardtabs === true || this.hardtabs === false) {
            session.setUseSoftTabs(!this.hardtabs);
        }
        if (this.mode && this.mode.trim().length > 0) {
            session.setMode('ace/mode/'+this.mode);
        }
        if (this.overwrite === true || this.overwrite === false) {
            session.setOverwrite(this.overwrite);
        }
        if (this.readonly === true || this.readonly === false) {
            this.editor.setReadOnly(this.readonly);
        }
        if (this.disablevalidation === true || this.disablevalidation === false) {
            session.setOption("useWorker",!this.disablevalidation);
        }
        if (this.tabsize && typeof this.tabsize==='number' && (this.tabsize%1) === 0) {
            session.setTabSize(this.tabsize);
        }
        if (this.theme && this.theme.trim().length > 0) {
            this.editor.setTheme('ace/theme/' + this.theme);
        }
        if (this.value) {
            this.editor.setValue(this.value,1);
        }
    },
    _addListeners: function() {
        var _this = this;
        this.editor.addEventListener('change',function(e) {
            if (_this.editor.getValue() !== _this.value) {
                _this.value = _this.editor.getValue();
            }
        });
    },
    _setupResizable: function() {
        //Move expandable corner to correct div
        var scroller = Polymer.dom(this.root).querySelector(".ace_scroller");
        Polymer.dom(scroller).appendChild(this.$.resizable)
    },
    _resizeEditor: function(e) {
        var _this = this;
        var container = this.$.editor;
        var rect = container.getBoundingClientRect();
        var startX = rect.width  + rect.left - e.clientX;
        var startY = rect.height  + rect.top - e.clientY;
        var mouseMove = function(e) {
            container.style.width = e.clientX - rect.left + startX + "px";
            container.style.height = e.clientY - rect.top + startY + "px";
            _this.editor.resize();
        };
        var mouseUp = function(e) {
            document.removeEventListener("mousemove",mouseMove,true);
            document.removeEventListener("mouseup",mouseUp,true);
        };
        document.addEventListener("mousemove",mouseMove,true);
        document.addEventListener("mouseup",mouseUp,true);
    },
    _fontsizeChanged: function(newVal) {
        if (!this.editor || typeof newVal!=='number' || (newVal%1) !== 0) {
            return;
        }
        this.editor.setFontSize(newVal);
    },
    _hardtabsChanged: function(newVal) {
        if (!this.editor || (newVal !== true && newVal !== false)) {
            return;
        }
        this.editor.getSession().setUseSoftTabs(!newVal);
    },
    _modeChanged: function(newVal) {
        if (!this.editor || !newVal || newVal.trim().length === 0) {
            return;
        }
        this.editor.getSession().setMode('ace/mode/'+newVal);
    },
    _overwriteChanged: function(newVal) {
        if (!this.editor || (newVal !== true && newVal !== false)) {
            return;
        }
        this.editor.getSession().setOverwrite(newVal);
    },
    _readonlyChanged: function(newVal) {
        if (!this.editor || (newVal !== true && newVal !== false)) {
            return;
        }
        this.editor.setReadOnly(newVal);
    },
    _disablevalidationChanged: function(newVal) {
        if (!this.editor || (newVal !== true && newVal !== false)) {
            return;
        }
        this.editor.getSession().setOption("useWorker",!newVal);
    },
    _tabsizeChanged: function(newVal) {
        if (!this.editor || !newVal || newVal.trim().length === 0) {
            return;
        }
        this.editor.getSession().setTabSize(newVal);
    },
    _themeChanged: function(newVal) {
        if (!this.editor || !newVal || newVal.trim().length === 0) {
            return;
        }
        this.editor.setTheme('ace/theme/'+newVal);
    },
    _valueChanged: function(newVal) {
        if (this.editor && newVal !== this.editor.getValue()) {
            this.editor.setValue(newVal,1);
        }
    }
});