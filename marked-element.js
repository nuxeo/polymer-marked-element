/**
@license
Copyright (c) 2015 The Polymer Project Authors. All rights reserved.
This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
Code distributed by Google as part of the polymer project is also
subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt
*/
import '@polymer/polymer/polymer-legacy.js';
import './marked-import.js';

import {Polymer} from '@polymer/polymer/lib/legacy/polymer-fn.js';
import {dom} from '@polymer/polymer/lib/legacy/polymer.dom.js';
import {html} from '@polymer/polymer/lib/utils/html-tag.js';

/**
Element wrapper for the [marked](https://github.com/chjj/marked) library.

`<marked-element>` accepts Markdown source and renders it to a child
element with the class `markdown-html`. This child element can be styled
as you would a normal DOM element. If you do not provide a child element
with the `markdown-html` class, the Markdown source will still be rendered,
but to a shadow DOM child that cannot be styled.


### Markdown Content

The Markdown source can be specified several ways:

#### Use the `markdown` attribute to bind markdown

    <marked-element markdown="`Markdown` is _awesome_!">
      <div slot="markdown-html"></div>
    </marked-element>

#### Use `<script type="text/markdown">` element child to inline markdown

    <marked-element>
      <div slot="markdown-html"></div>
      <script type="text/markdown">
        Check out my markdown!

        We can even embed elements without fear of the HTML parser mucking up their
        textual representation:

        ```html
        <awesome-sauce>
          <div>Oops, I'm about to forget to close this div.
        </awesome-sauce>
        ```
      </script>
    </marked-element>

#### Use `<script type="text/markdown" src="URL">` element child to specify remote markdown

    <marked-element>
      <div slot="markdown-html"></div>
      <script type="text/markdown" src="../guidelines.md"></script>
    </marked-element>

Note that the `<script type="text/markdown">` approach is *static*. Changes to
the script content will *not* update the rendered markdown!

Though, you can data bind to the `src` attribute to change the markdown.

```html
<marked-element>
  <div slot="markdown-html"></div>
  <script type="text/markdown" src$="[[source]]"></script>
</marked-element>
...
<script>
  ...
  this.source = '../guidelines.md';
</script>
```

### Styling
If you are using a child with the `markdown-html` class, you can style it
as you would a regular DOM element:

    [slot="markdown-html"] p {
      color: red;
    }

    [slot="markdown-html"] td:first-child {
      padding-left: 24px;
    }

@element marked-element
@demo demo/index.html
*/
Polymer({
  /** @override */
  _template: html`
    <style>
      :host {
        display: block;
      }
    </style>
    <slot name="markdown-html">
      <div id="content"></div>
    </slot>
  `,

  is: 'marked-element',

  properties: {
    /**
     * The markdown source that should be rendered by this element.
     */
    markdown: {
      type: String,
      value: null,
    },
    /**
     * Enable GFM line breaks (regular newlines instead of two spaces for
     * breaks)
     */
    breaks: {
      type: Boolean,
      value: false,
    },
    /**
     * Conform to obscure parts of markdown.pl as much as possible. Don't fix
     * any of the original markdown bugs or poor behavior.
     */
    pedantic: {
      type: Boolean,
      value: false,
    },
    /**
     * Function used to customize a renderer based on the [API specified in the
     * Marked
     * library](https://github.com/chjj/marked#overriding-renderer-methods).
     * It takes one argument: a marked renderer object, which is mutated by the
     * function.
     */
    renderer: {
      type: Function,
      value: null,
    },
    /**
     * Sanitize the output. Ignore any HTML that has been input.
     */
    sanitize: {
      type: Boolean,
      value: false,
    },
    /**
     * Function used to customize a sanitize behavior.
     * It takes one argument: element String without text Contents.
     *
     * e.g. `<div>` `<a href="/">` `</p>'.
     * Note: To enable this function, must set `sanitize` to true.
     * WARNING: If you are using this option to untrusted text, you must to
     * prevent XSS Attacks.
     */
    sanitizer: {
      type: Function,
      value: null,
    },
    /**
     * If true, disables the default sanitization of any markdown received by
     * a request and allows fetched unsanitized markdown
     *
     * e.g. fetching markdown via `src` that has HTML.
     * Note: this value overrides `sanitize` if a request is made.
     */
    disableRemoteSanitization: {
      type: Boolean,
      value: false,
    },
    /**
     * Use "smart" typographic punctuation for things like quotes and dashes.
     */
    smartypants: {
      type: Boolean,
      value: false,
    },
    /**
     * Callback function invoked by Marked after HTML has been rendered.
     * It must take two arguments: err and text and must return the resulting
     * text.
     */
    callback: {
      type: Function,
      value: null,
    },
    /**
     * A reference to the XMLHttpRequest instance used to generate the
     * network request.
     *
     * @type {XMLHttpRequest}
     */
    xhr: {
      type: Object,
      notify: true,
      readOnly: true,
    },
  },

  observers: [
    'render(markdown, breaks, pedantic, renderer, sanitize, sanitizer, smartypants, callback)'
  ],

  /** @override */
  ready: function() {
    if (this.markdown) {
      return;
    }

    // Use the Markdown from the first `<script>` descendant whose MIME type
    // starts with "text/markdown". Script elements beyond the first are
    // ignored.
    this._markdownElement = dom(this).querySelector('[type="text/markdown"]');
    if (!this._markdownElement) {
      return;
    }

    if (this._markdownElement.src) {
      this._request(this._markdownElement.src);
    }

    if (this._markdownElement.textContent.trim() !== '') {
      this.markdown = this._unindent(this._markdownElement.textContent);
    }

    var observer =
        new MutationObserver(this._onScriptAttributeChanged.bind(this));
    observer.observe(this._markdownElement, {attributes: true});
  },

  /**
   * Renders `markdown` to HTML when the element is attached.
   *
   * This serves a dual purpose:
   *
   *  * Prevents unnecessary work (no need to render when not visible).
   *
   *  * `attached` fires top-down, so we can give ancestors a chance to
   *    register listeners for the `syntax-highlight` event _before_ we render
   *    any markdown.
   * @override
   */
  attached: function() {
    this._attached = true;
    this._outputElement = this.outputElement;
    this.render();
  },

  /** @override */
  detached: function() {
    this._attached = false;
  },

  /**
   * Unindents the markdown source that will be rendered.
   *
   * @param {string} text
   * @return {string}
   */
  unindent: function(text) {
    return this._unindent(text);
  },

  get outputElement() {
    var child = dom(this).queryDistributedElements('[slot="markdown-html"]')[0];
    return child || this.$.content;
  },

  /**
   * The `marked-render-complete` event is fired once Markdown to HTML
   * conversion has finished, and the DOM has been populated via the resulting
   * HTML.
   *
   * @event marked-render-complete
   */

  /**
   * Renders `markdown` into this element's DOM.
   *
   * This is automatically called whenever the `markdown` property is changed.
   *
   * The only case where you should be calling this is if you are providing
   * markdown via `<script type="text/markdown">` after this element has been
   * constructed (or updating that markdown).
   */
  render: function() {
    if (!this._attached) {
      return;
    };

    if (!this.markdown) {
      dom(this._outputElement).innerHTML = '';
      return;
    }

    var renderer = new marked.Renderer();

    if (this.renderer) {
      this.renderer(renderer);
    }

    var opts = {
      renderer: renderer,
      highlight: this._highlight.bind(this),
      breaks: this.breaks,
      sanitize: this.sanitize,
      sanitizer: this.sanitizer,
      pedantic: this.pedantic,
      smartypants: this.smartypants
    };

    dom(this._outputElement).innerHTML =
        marked(this.markdown, opts, this.callback);
    this.fire('marked-render-complete', {}, {composed: true});
  },

  /**
   * Fired when the content is being processed and before it is rendered.
   * Provides an opportunity to highlight code blocks based on the programming
   * language used. This is also known as syntax highlighting. One example would
   * be to use a prebuilt syntax highlighting library, e.g with
   * [highlightjs](https://highlightjs.org/).
   *
   * @param {string} code
   * @param {string} lang
   * @return {string}
   * @event syntax-highlight
   */
  _highlight: function(code, lang) {
    var event = this.fire(
        'syntax-highlight', {code: code, lang: lang}, {composed: true});
    return event.detail.code || code;
  },

  /**
   * @param {string} text
   * @return {string}
   */
  _unindent: function(text) {
    if (!text)
      return text;
    var lines = text.replace(/\t/g, '  ').split('\n');
    var indent = lines.reduce(function(prev, line) {
      if (/^\s*$/.test(line))
        return prev;  // Completely ignore blank lines.

      var lineIndent = line.match(/^(\s*)/)[0].length;
      if (prev === null)
        return lineIndent;
      return lineIndent < prev ? lineIndent : prev;
    }, null);

    return lines
        .map(function(l) {
          return l.substr(indent);
        })
        .join('\n');
  },

  /**
   * Fired when the XHR finishes loading
   *
   * @param {string} url
   * @event marked-loadend
   */
  _request: function(url) {
    this._setXhr(new XMLHttpRequest());
    var xhr = this.xhr;

    if (xhr.readyState > 0) {
      return null;
    }

    xhr.addEventListener('error', this._handleError.bind(this));
    xhr.addEventListener('loadend', function(e) {
      var status = this.xhr.status || 0;
      // Note: if we are using the file:// protocol, the status code will be 0
      // for all outcomes (successful or otherwise).
      if (status === 0 || (status >= 200 && status < 300)) {
        this.sanitize = !this.disableRemoteSanitization;
        this.markdown = e.target.response;
      } else {
        this._handleError(e);
      }

      this.fire('marked-loadend', e);
    }.bind(this));

    xhr.open('GET', url);
    xhr.setRequestHeader('Accept', 'text/markdown');
    xhr.send();
  },

  /**
   * Fired when an error is received while fetching remote markdown content.
   *
   * @param {!Event} e
   * @event marked-request-error
   */
  _handleError: function(e) {
    var evt = this.fire('marked-request-error', e, {cancelable: true});
    if (!evt.defaultPrevented) {
      this.markdown = 'Failed loading markdown source';
    }
  },

  /**
   * @param {!Array<!MutationRecord>} mutation
   */
  _onScriptAttributeChanged: function(mutation) {
    if (mutation[0].attributeName !== 'src') {
      return;
    }

    this._request(this._markdownElement.src);
  }
});