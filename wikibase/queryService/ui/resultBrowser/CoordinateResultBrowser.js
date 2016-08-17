var wikibase = wikibase || {};
wikibase.queryService = wikibase.queryService || {};
wikibase.queryService.ui = wikibase.queryService.ui || {};
wikibase.queryService.ui.resultBrowser = wikibase.queryService.ui.resultBrowser || {};

wikibase.queryService.ui.resultBrowser.CoordinateResultBrowser = ( function( $, L, d3, _, window ) {
	'use strict';

	var MAP_DATATYPE = 'http://www.opengis.net/ont/geosparql#wktLiteral';
	var GLOBE_EARTH = 'Q2';

	var LAYER_COLUMN = 'layer';
	var LAYER_DEFAULT_GROUP = '_LAYER_DEFAULT_GROUP';

	var TILE_LAYER = {
		wikimedia: {
			url: 'https://maps.wikimedia.org/osm-intl/{z}/{x}/{y}.png',
			options: {
				id: 'wikipedia-map-01',
				attribution: ' <a href="http://maps.wikimedia.org/">Wikimedia</a> | &copy; <a href="http://openstreetmap.org/copyright">Open Street Map</a> contributors'
			}
		},
		osm: {
			url: 'http://{s}.tile.osm.org/{z}/{x}/{y}.png',
			options: {
				attribution: '&copy; <a href="http://osm.org/copyright">OpenStreetMap</a> contributors'
			}
		}
	};

	var ScrollToTopButton = null;

	/**
	 * A result browser for long lat coordinates
	 *
	 * @class wikibase.queryService.ui.resultBrowser.CoordinateResultBrowser
	 * @licence GNU GPL v2+
	 *
	 * @author Jonas Kress
	 * @author Katie Filbert
	 * @constructor
	 *
	 */
	function SELF() {
	}

	SELF.prototype = new wikibase.queryService.ui.resultBrowser.AbstractResultBrowser();

	/**
	 * Draw a map to the given element
	 *
	 * @param {jQuery} $element target element
	 */
	SELF.prototype.draw = function( $element ) {
		var container = $( '<div>' ).attr( {
			'id': 'map'
		} ).height( '100vh' );

		$element.html( container );

		var markerGroups = this._getMarkerGroups(),
			map = L.map( 'map', {
			center: [ 0, 0 ],
			maxZoom: 18,
			minZoom: 2,
			fullscreenControl: true,
			layers: _.compact( markerGroups ) // convert object to array
		} ).fitBounds( markerGroups[ LAYER_DEFAULT_GROUP ].getBounds() );

		this._setTileLayer( map );
		this._createControls( map, markerGroups );

		$element.html( container );
	};

	/**
	 * Create map controls
	 *
	 * @private
	 */
	SELF.prototype._createControls = function( map, markerGroups ) {
		//zoom control
		map.addControl( L.control.zoomBox( {
			modal: false,
			className: 'glyphicon glyphicon-zoom-in'
		} ) );
		map.addControl( new ScrollToTopButton() );

		//layers control
		var numberOfLayers = Object.keys( markerGroups ).length;
		if ( numberOfLayers > 1 ) {
			var control = this._getLayerControl( markerGroups ).addTo( map );

			// update layer control
			map.on( 'overlayadd overlayremove', function ( event ) {
				if ( event.layer !== markerGroups[ LAYER_DEFAULT_GROUP ] ) {
					return;
				}
				$.each( markerGroups, function( i, layer ) {
					if ( event.type === 'overlayadd' ) {
						map.addLayer( layer );
					} else {
						map.removeLayer( layer );
					}
				} );
				control._update();
			} );
		}
	};

	/**
	 * @private
	 */
	SELF.prototype._getLayerControl = function( markerGroups ) {
		var self = this,
			layerControls = {},
			control = '';

		$.each( markerGroups, function( name, markers ) {
			if ( name === LAYER_DEFAULT_GROUP ) {
				control = self._i18n( 'wdqs-result-map-layers-all', 'All layers' );
			} else {
				var color = self._getMarkerGroupColor( name );
				control = '<span style="color:' + color + '">&#x2b24;</span> ' + name;
			}

			layerControls[ control ] = markers;
		} );

		return L.control.layers( null, layerControls );
	};

	/**
	 * @private
	 */
	SELF.prototype._getMarkerGroups = function() {
		var self = this, markers = {};
		markers[ LAYER_DEFAULT_GROUP ] = [];

		this._iterateResult( function( field, key, row ) {
			if ( field && field.datatype === MAP_DATATYPE ) {
				var longLat = self._extractLongLat( field.value );
				if ( longLat === null || !longLat[0] || !longLat[1] ) {
					return true;
				}

				var popup = L.popup(),
					lon = longLat[0],
					lat = longLat[1];

				var layer = row[ LAYER_COLUMN ] && row[ LAYER_COLUMN ].value || LAYER_DEFAULT_GROUP;
				var marker = L.circleMarker( [ lat, lon ], self._getMarkerStyle( layer ) )
					.bindPopup( popup );

				marker.on( 'click', function() {
					var info = self._getItemDescription( row );
					popup.setContent( info[0] );
				} );

				if ( !markers[ layer ] ) {
					markers[ layer ] = [];
				}
				markers[ layer ].push( marker );
				markers[ LAYER_DEFAULT_GROUP ].push( marker );
			}
		} );

		if ( Object.keys( markers ).length === 0 ) {
			var marker = L.marker( [ 0, 0 ] ).bindPopup( 'Nothing found!' ).openPopup();
			return { null: L.featureGroup( [marker] ) };
		}

		$.each( markers, function( key ) {
			markers[ key ] = L.featureGroup( markers[ key ] );
		} );

		return markers;
	};

	/**
	 * Maps group name to a certain color
	 * @private
	 */
	SELF.prototype._getMarkerGroupColor = d3.scale.category20();

	/**
	 * @private
	 * @param {string} group
	 */
	SELF.prototype._getMarkerStyle = function( group ) {
		var color = '#e04545';

		if ( group !== LAYER_DEFAULT_GROUP ) {
			color = this._getMarkerGroupColor( group );
		}

		return {
			radius: 3,
			color: color,
			opacity: 0.8,
			fillColor: color,
			fillOpacity: 0.9
		};
	};

	/**
	 * @private
	 */
	SELF.prototype._extractLongLat = function( point ) {
		var globe = this._extractGlobe( point );

		if ( globe !== null && globe !== GLOBE_EARTH ) {
			return null;
		}

		point = point.match( /Point\((.*)\)/ ).pop();

		return point.split( ' ' );
	};

	/**
	 * @private
	 */
	SELF.prototype._extractGlobe = function( point ) {
		var globe = null;

		if ( ( globe = point.match( /<http\:\/\/www\.wikidata\.org\/entity\/(.+)>/i ) ) ) {
			globe = globe.pop();
		}

		return globe;
	};

	/**
	 * @private
	 */
	SELF.prototype._getItemDescription = function( row ) {
		var $result = $( '<div/>' ).append( this._getFormatter().formatRow( row, true ) );

		return $result;
	};

	/**
	 * @private
	 */
	SELF.prototype._setTileLayer = function( map ) {
		var layer = TILE_LAYER.osm;
		if ( window.location.host === 'query.wikidata.org' ||
				window.location.host === 'localhost' ||
				window.location.host.endsWith( '.wmflabs.org' ) ) {
			layer = TILE_LAYER.wikimedia;
		}

		L.tileLayer( layer.url, layer.options ).addTo( map );
	};

	ScrollToTopButton = L.Control.extend( {
		options: {
			position: 'topright'
		},

		onAdd: function( map ) {
			var container = L.DomUtil.create( 'button' );
			$( container ).addClass( 'btn btn-default' );
			$( container ).append( $( ' <span class="glyphicon glyphicon-chevron-up"/> ' ) );

			container.onclick = function() {
				if ( map.isFullscreen() ) {
					map.toggleFullscreen();
				}
				$( window ).scrollTop( 0, 0 );
			};

			return container;
		}
	} );

	/**
	 * Receiving data from the a visit
	 *
	 * @param {Object} data
	 * @return {boolean} false if there is no revisit needed
	 */
	SELF.prototype.visit = function( data ) {
		return this._checkCoordinate( data );
	};

	/**
	 * Check if this value contains an coordinate value.
	 */
	SELF.prototype._checkCoordinate = function( value ) {
		if ( value && value.datatype === MAP_DATATYPE ) {
			var globe = this._extractGlobe( value.value );
			if ( globe === null || globe === GLOBE_EARTH ) {
				this._drawable = true;
				return false;
			}
		}
		return true;
	};

	return SELF;
}( jQuery, L, d3, _, window ) );
