SilverBullet is an extensible, [open source](https://github.com/silverbulletmd/silverbullet), **personal knowledge management** system. Indeed, that’s fancy talk for “a note-taking app with links.” However, SilverBullet goes _a bit_ beyond just that.

You’ve been told there is _no such thing_ as a [silver bullet](https://en.wikipedia.org/wiki/Silver_bullet). You were told wrong.

Before we get to the nitty gritty, some _quick links_ for the impatient reader: [[Install]], [[Manual]], [[CHANGELOG]], [Roadmap](https://github.com/orgs/silverbulletmd/projects/2/views/1), [Issues](https://github.com/silverbulletmd/silverbullet/issues), [Discussions](https://github.com/silverbulletmd/silverbullet/discussions), [Mastodon](https://fosstodon.org/@silverbulletmd), [Discord](https://discord.gg/EvXbFucTxn), [Docker Hub](https://hub.docker.com/r/zefhemel/silverbullet).

Now that we got that out of the way let’s have a look at some of SilverBullet’s features.

## Features
* Runs in any modern browser (including on mobile) as a [[PWA]] in two [[Client Modes]] (_online_ and _synced_ mode), where the _synced mode_ enables **100% offline operation**, keeping a copy of content in the browser, syncing back to the server when a network connection is available.
* Provides an enjoyable [[Markdown]] writing experience with a clean UI, rendering text using [[Live Preview|live preview]], further **reducing visual noise** while still providing direct access to the underlying markdown syntax.
* Supports wiki-style **page linking** using the `[[page link]]` syntax. Incoming links are indexed and appear as “Linked Mentions” at the bottom of the pages linked to thereby providing _bi-directional linking_.
* Optimized for **keyboard-based operation**:
  * Quickly navigate between pages using the **page switcher** (triggered with `Cmd-k` on Mac or `Ctrl-k` on Linux and Windows).
  * Run commands via their keyboard shortcuts or the **command palette** (triggered with `Cmd-/` or `Ctrl-/` on Linux and Windows).
  * Use [[Slash Commands]] to perform common text editing operations.
* Provides a platform for [end-user programming](https://www.inkandswitch.com/end-user-programming/) through its support for [[Objects]], [[Live Queries]] and [[Live Templates]].
* Robust extension mechanism using [[🔌 Plugs]].
* **Self-hosted**: you own your data. All content is stored as plain files in a folder on disk. Back up, sync, edit, publish, script with any additional tools you like.
* SilverBullet is [open source, MIT licensed](https://github.com/silverbulletmd/silverbullet) software.

To get a good feel of what SilverBullet is capable of, have a look at this introduction video.

```embed
url: https://youtu.be/VemS-cqAD5k
```
## Try it
Here’s the kicker:

==You are looking at a (more or less) operational copy of SilverBullet **right now**==.

That’s right, **this very website is powered by SilverBullet itself**. 🤯

On this site, everything is editable, just none of it syncs back (successfully) to the server. You are editing a local copy of this website, so changes do persist locally.

Don’t just sit there, try it!

* Click on the page picker (book icon) icon at the top right, or hit `Cmd-k` (Mac) or `Ctrl-k` (Linux and Windows) to open the **page switcher**. Type the name of a non-existent page to create it (although it won’t save in this environment).
* Click on the terminal button (top right) or hit `Cmd-/` (Mac) or `Ctrl-/` (Linux and Windows) to open the **command palette** (note that not all commands will work in this mode).
* Select some text and hit `Alt-m` to ==highlight== it, or `Cmd-b` (Mac) or `Ctrl-b` (Windows/Linux) to make it **bold**, or `Cmd-i` (Mac) or `Ctrl-i` (Windows/Linux) to make it _italic_.
* Click a link somewhere on this page to navigate there.
* Start typing `[[` somewhere to insert a page link (with completion).
* [ ] Tap this box 👈 to mark this task as done.
* Start typing `:party` to trigger the emoji picker 🎉
* Type `/` somewhere in the text to invoke a **slash command**.
* Click this button {[Editor: Toggle Vim Mode]} to toggle Vim mode
* Open this site on your phone or tablet and... it just works!
* Are you using a browser with **PWA support** (e.g., any Chromium-based
  browser)? Click on that little icon to the right of your location bar that says “Install SilverBullet” to give SB its own window frame and desktop icon, like it is a stand-alone app (not particularly useful on silverbullet.md, but definitely do this once you install it yourself). Now, unplug your network cable and reload the page. It still works!

Oh yeah, and you can use fancy things like tables:

| Page | Comment |
|----------|----------|
| [[SilverBullet]] | Main product page |
| [[CHANGELOG]] | The latest updates |

or code snippets, like JavaScript:

```javascript
function helloWorld() {
   return "Hello there!"
}
```

or YAML:

```yaml
name: SilverBullet
rating: 5
```

But where things get _really_ interesting is when using features like [[Live Queries]] that allow you to query all types of [[Objects]] indexed based on the pages in your space. 

Let’s explore this with a meta example of using this for this very website. All pages in this space that represent a plug are tagged with the `#plug` tag. Now, if we would want to render a list of all plugs in one place using the [[template/plug]] template, we can simply do this:

```query
plug render [[template/plug]]
```
Hover over that list, click the edit button to see the query that generates this view.

And it’s not just pages that can be queried, there’s a large variety of queriable sources and you can define your own via tags. Examples include `task`s, `page`s, `tag`s, and `link`s.

For instance, here’s a list of all outgoing page links from this page:
```query
link where page = "{{@page.name}}" select toPage as name render [[template/page]]
```
The sky is the limit.

## Install SilverBullet
Has your mind been sufficiently blown to commit to an install? Took you long enough, alright then. Please proceed to the [[Install]] and enjoy!

## Where to go from here
Have a lock at our work-in-progress [[Manual]].

## Support
If you (hypothetically) find bugs or have feature requests, post them in [our issue tracker](https://github.com/silverbulletmd/silverbullet/issues). Want to contribute? [Check out the code](https://github.com/silverbulletmd/silverbullet).

Want to chat with us? [Join our Discord](https://discord.gg/EvXbFucTxn)!