var yo = require('yo-yo')
var css = require('sheetify')

const styles = css`
  :host {
    max-height: 100vh;
    overflow: scroll;
    background: #fff;
    border-radius: 5px;
    padding: 5px;
    box-shadow: 0px 0px 3px #888;
  }
`

module.exports = Layers

/**
 * Creates a layer toggle control
 * @param {Object} [options]
 * @param {string} [options.type='multiple'] Selection type: `multiple` to allow independently toggling each layer/group, `single` to only choose one at a time.
 * @param {Object} [options.layers] An object determining which layers to include.  Each key is a display name (what's shown in the UI), and each value is the corresponding layer id in the map style (or an array of layer ids).
 * @param {function} [options.onChange] Optional callback called with `{name: dispayName, layerIds: [...], active: true|false }` for the clicked layer
 * @example
 * (new Layers({ 'National Parks': 'national_park', 'Other Parks': 'parks' }))
 * .addTo(map)
 */
function Layers (options) {
  this.options = Object.assign({}, this.options, options)
  if (options.layers) {
    // normalize layers to arrays
    var layers = {}
    for (var k in this.options.layers) {
      layers[k] = Array.isArray(this.options.layers[k])
        ? this.options.layers[k] : [this.options.layers[k]]
    }
    this.options.layers = layers
  }


  this._container = document.createElement('div');
  this._onClick = this._onClick.bind(this)
  this._isActive = this._isActive.bind(this)
  this._layerExists = this._layerExists.bind(this)
  this._update = this._update.bind(this)
}

Layers.prototype.constructor = Layers
Layers.prototype.options = { type: 'multiple' }
Layers.prototype.onAdd = function onAdd (map) {
  this._map = map
  var style = map.getStyle()
  this._allLayers = style.layers.map((layer) => layer.id)
  if (!this.options.layers) {
    this.options.layers = {}

    // if there's Mapbox Studio metadata available, use any groups we can find
    var groups = {}
    if (style.metadata && style.metadata['mapbox:groups']) {
      groups = style.metadata['mapbox:groups']
      Object.keys(groups).forEach((g) => { this.options.layers[groups[g].name] = [] })
    }

    style.layers.forEach((layer) => {
      var group = layer.metadata ? groups[layer.metadata['mapbox:group']] : null
      if (layer.metadata && group) {
        this.options.layers[group.name].push(layer.id)
      } else {
        this.options.layers[layer.id] = [layer.id]
      }
    })
  }
  this._map.on('style.change', this._update)
  this._map.style.on('layer.remove', this._update)
  this._map.style.on('layer.add', this._update)
  this._update()
  return this._container
}

Layers.prototype.onRemove = function onRemove () {
  this._container.parentNode.removeChild(this._container);
  this._map.off('style.change', this._update)
  this._map.style.off('layer.remove', this._update)
  this._map.style.off('layer.add', this._update)
  this._map = undefined;
}

Layers.prototype._update = function _update () {
  this._allLayers = this._map.getStyle().layers.map((layer) => layer.id)
  yo.update(this._container, this._render())
}

Layers.prototype._render = function _render () {
  var layers = this.options.layers
  var className = 'mapboxgl-ctrl'
  return yo`
  <div class="${className} ${styles}">
    ${Object.keys(layers)
      .filter((name) => layers[name].some(this._layerExists))
      .map((name) => {
        var ids = layers[name].filter(this._layerExists)
        var active = ids.every(this._isActive)
        var className = active ? 'active'
          : ids.some(this._isActive) ? 'active partially-active'
          : ''
        return yo`
        <div>
          <input ${active ? 'checked': ''} type="radio" name=${this.options.type === 'single' ? 'layer' : `${name}`} data-layer-name=${name} data-layer-id=${ids.join(',')} class=${className} onclick=${this._onClick} />
          ${name}
        </div>`
      })}
  </div>
  `
}

Layers.prototype._onClick = function _onClick (e) {
  var ids = e.currentTarget.getAttribute('data-layer-id').split(',')
    .filter(this._layerExists)

  var activated = false
  if (this.options.type === 'single') {
    // single selection mode
    if (this._currentSelection) {
      this._currentSelection.forEach((id) => {
        this._map.setLayoutProperty(id, 'visibility', 'none')
      })
    }
    // turn on any layer that IS in the selected group
    ids.forEach((id) => {
      this._map.setLayoutProperty(id, 'visibility', 'visible')
    })
    this._currentSelection = ids
    activated = true
  } else {
    // 'toggle' mode
    var visibility = ids.some(this._isActive) ? 'none' : 'visible'
    ids.forEach((id) => {
      this._map.setLayoutProperty(id, 'visibility', visibility)
    })
    activated = visibility === 'visible'
  }

  if (this.options.onChange) {
    this.options.onChange({
      name: e.currentTarget.getAttribute('data-layer-name'),
      layerIds: ids,
      active: activated
    })
  }
  this._update()
}

Layers.prototype._isActive = function isActive (id) {
  return this._map.getLayoutProperty(id, 'visibility') === 'visible'
}

Layers.prototype._layerExists = function (id) {
  return this._allLayers.indexOf(id) >= 0
}
