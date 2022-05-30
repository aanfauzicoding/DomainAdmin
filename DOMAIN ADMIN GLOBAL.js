/**
 * Domain Admin Global
 * Copyright 2022 Aan Fauzi
 * Licensed under: SEE LICENSE IN https://github.com/aanfauzicoding/DomainAdmin/blob/main/LICENSE
 */
/*jslint browser: true */
/*global window, escape, unescape, $, $$, $A, $F, $H, $R Ajax, Class, Draggable, Element, Event, Field, Form, PeriodicalExecuter, Prototype, Template, Effect, gt_data, Gettext, Calendar, pageScope */

// extend prototype library - begin
// added so that form disable/enable includes html tag 'button' (which is used for graphicButton)
Form.Element.Serializers.button = function(element, value) {
	// calling 'textarea' because it is similar to 'button' and already supported by prototype
	Form.Element.Serializers.textarea(element, value);
};

var LOG_LEVEL = "error";

// create console.log for non-firebug browsers. logging to browser alert function
var LOG_LEVEL_LIST = $A([
	'debug',	// LOG_LEVEL 0
	'info',	// LOG_LEVEL 1
	'warn',	// LOG_LEVEL 2
	'error',	// LOG_LEVEL 3
	'log'	// LOG_LEVEL 4
]);
if (window.console) {
	// browser supports console logging (e.g. firebug)
	LOG_LEVEL_LIST.each( function(level, index) {
		if (index >= LOG_LEVEL) {
			window[level] = function(msg) {
				//window.alert(msg);
				window.console[level](msg);
			};
		} else {
			window[level] = function() {
				//window.console[level](msg);
			};
		}
	});
} else {
	// browser does not support console logging (e.g. ie)
	LOG_LEVEL_LIST.each( function(level, index) {
		if (index >= LOG_LEVEL) {
			window[level] = function(msg) {
				window.alert(msg);
			};
		} else {
			window[level] = function() {};
		}
	});
}
// extend prototype library - end

/* I18N */
localize = function(key) {
	return key;
}

// generic communication error message used everywhere
comErrorMessage = localize('There was an error communicating with the server, please try again.');

// used all over as loading graphic
var loading = localize('Loading');
var processing = localize('Saving');
var fieldProcessing = localize('Saving');

/* a message to show on the DNS section, if it exists on this page, if you choose anything but "Use our name servers" */
var invalid_nameserver_msg = localize("The DNS/Zone information on this page will have no effect because your nameservers need to be set to use our name servers.");

/* globally extend button with the Form.disable and Form.enable functions from prototype,
buttons are special */
Element.addMethods('button', {
	enable: Field.enable,
	disable: Field.disable
});

Element.addMethods('form', {
	showProcessing: showProcessingForm,
	stopProcessing: stopProcessingForm
});

/* globally extend the Element object to get text from an element */
Element.addMethods({
	getText:	function(element) {
		var text = "";
		var child = element.firstChild;
		while (child) {
			if (child.nodeType == 3) {
				text += child.nodeValue;
			}
			child = child.nextSibling;
		}
		return text;
	},
	toggle:	function(element) {
		if (Element.visible(element)) {
			element.hide();
		} else {
			element.show();
		}
		return element;
	}
});

// Parse a ISO UTC Time string into JS Date Object
function parseISO8601(str) {
	// we assume str is a UTC date ending in 'Z'
	var parts = str.split('T'),
	dateParts = parts[0].split('-'),
	timeParts = parts[1].split('Z'),
	timeSubParts = timeParts[0].split(':'),
	timeSecParts = timeSubParts[2].split('.'),
	timeHours = Number(timeSubParts[0]),
	_date = new Date();

	_date.setUTCFullYear(Number(dateParts[0]));
	_date.setUTCMonth(Number(dateParts[1])-1);
	_date.setUTCDate(Number(dateParts[2]));
	_date.setUTCHours(Number(timeHours));
	_date.setUTCMinutes(Number(timeSubParts[1]));
	_date.setUTCSeconds(Number(timeSecParts[0]));
	if (timeSecParts[1]) {
		_date.setUTCMilliseconds(Number(timeSecParts[1]));
	}

	return _date;
}



/* highlight field */
highlightField = function(e) {
	var myField = e.findElement();
	if (e.type == "focus" ) {
		myField.addClassName("active");
	} else {
		myField.removeClassName("active");
	}
};

var PageScope = {
	getKey: function(keyName, defaultValue) {
		var value = defaultValue;

		try {
			if (pageScope[keyName]) {
				value = pageScope[keyName];
			}
		} catch(e) {
		}

		return value;
	},
	setKey: function(keyName, value) {
		try {
			pageScope[keyName] = value;
		} catch(e) {
			throw('pageScope is not defined');
		}
	}
};

var UCPForm = {
	STATUS_MESSAGE_TEXT: 'text',
	STATUS_MESSAGE_FIELD_LIST: 'fieldList',

	setFieldValue: function(fieldId, value, isSetDefault) {
		var field = $(fieldId);

		// ie: null check
		if (value !== null) {
			if (isSetDefault) {
				if (value !== undefined) {
					switch (field.tagName.toLowerCase()) {
						case 'textarea':
							// fall-through
						case 'input':
							switch (field.type.toLowerCase()) {
								case 'checkbox':
									// fall-through
								case 'radio':
									field.defaultChecked = (value === true);
									break;
								default:
									field.defaultValue = value || '';
								break;
							}
							break;
						case 'select':
							for (var i=0; i<field.length; i++) {
								if (field.options[i].value == value) {
									field.options[i].defaultSelected = true;
									field.selectedIndex = i;	// needed for webkit to pre-select option in drop-down
									break;
								}
							}
							break;
					}
				}
			}

			field.setValue(value);
		}
	},

	loadFields: function(fieldsCfg) {
		fieldsCfg.each( function(cfg) {
			var field = $(cfg.id);
			if (field) {
				var value = cfg.value;
				if ( (value !== undefined) && (value !== null) ) {
					UCPForm.setFieldValue(field, value, true);

					if (cfg.showField) {
						field.show();
					}
				}
			} else {
				throw('loadFields - field element not found');
			}
		});
	},

	/* set field changed flag */
	fieldChanged: function(e) {
		var myField = e.findElement();
		myField.addClassName('fieldChanged');

		var form = e.findElement('form');
		UCPForm.setFormModified(form, true);
	},

	/* set form changed flag */
	isPageModified: function() {
		var pageModified = false;

		var formModifiedList = PageScope.getKey('formModifiedList');
		if (formModifiedList) {
			formModifiedList = $H(formModifiedList);
			pageModified = (formModifiedList.size() > 0);
		}

		return pageModified;
	},
	isFormModified: function(form) {
		var formModified = false;

		var formModifiedList = PageScope.getKey('formModifiedList');
		if (formModifiedList) {
			formModified = (formModifiedList[form.id] !== undefined);
		} else {
			formModified = true;
		}

		return formModified;
	},
	setFormModified: function(form, isModified) {
		var formModifiedList = PageScope.getKey('formModifiedList');
		if (formModifiedList) {
			if (isModified) {
				formModifiedList[form.id] = null;
			} else {
				delete(formModifiedList[form.id]);
			}
		}

		UCPForm.showFormChangeRevert(form, isModified);
	},
	showFormChangeRevert: function(form, isShow) {
		form = $(form);

		// update formChanged class to identicate if the form has been modified
		if (isShow) {
			form.addClassName('formChanged');
		} else {
			form.removeClassName('formChanged');
		}

		// find revertElement or buttonContainer (which contains the revertLink)
		var buttonsContainer = null;
		var revertElement = form.down('a.revertLink');
		if (! revertElement) {
			buttonsContainer = UCPForm.seekClassElement(form, 'buttons', true);

			// find buttonContainer in sectionContainer
			if (! buttonsContainer) {
				// get sectionContainer
				var sectionContainer = UCPForm.seekClassElement(form, 'section', true);
				if (sectionContainer) {
					// get buttonContainer in sectionContainer
					buttonsContainer = UCPForm.seekClassElement(sectionContainer, 'buttons', true);
					if (buttonsContainer) {
						revertElement = buttonsContainer.down('a.revertLink');
					}
				} else {
					throw('UCPForm.showFormChangeRevert - sectionContainer not found. [form.id]=>[' + form.id + ']');
				}
			}
		}

		// revertElement does not exist yet and is needed to be shown, so create the revertElement
		if ( (! revertElement) && (isShow === true) ) {
			if (buttonsContainer) {
				revertElement = new Element('a', {'class': 'revertLink button', 'href': 'javascript:void(0)'}).update(localize('Revert'));
				revertElement.observe('click', function(e) {
					UCPForm.setFormModified(form, false);

					form.reset();
					form.fire('ucp:revert');
				});

				buttonsContainer.insert({'top': revertElement});
			} else {
				throw('UCPForm.showFormChangeRevert - buttonsContainer not defined. [form.id]=>[' + form.id + ']');
			}
		}

		// show/hide the revertElement
		if (revertElement) {
			if (isShow) {
				revertElement.show();
			} else {
				revertElement.hide();
			}
		}
	},

	// section/field status messages - begin
	// section/field status messages - helper functions - begin
	// section/field status messages - helper functions - find element - begin
	// retrieve an element that has the specified className relative to the startElement.
	// if the startElement has the specified className then the startElement is returned.
	// otherwise, the element is searched for down the heirarchy, then up the heirarchy.
	// startElement - the element to search from
	// className - the className of the element to search for
	// isSkipCreate - (optional) if an exception should be thrown if the subSection element cannot be found
	seekClassElement: function(startElement, className, isSkipCreate) {
		var element = null;

		startElement = $(startElement);	// make sure startElement is extended
		if (startElement) {
			if (startElement.hasClassName(className)) {
				element = startElement;
			} else {
				// search down dom heirarchy
				element = startElement.down('.' + className);
				if (! element) {
					// search up dom heirarchy
					element = startElement.up('.' + className);
					if (! element) {
						// element still not found
						if (! isSkipCreate) {
							throw('seekClassElement - element with className cannot be found. [className]=>[' + className + ']');
						}
					}
				}
			}
		} else {
			if (! isSkipCreate) {
				throw('seekClassElement - startElement does not exist');
			}
		}

		return element;
	},
	// retrieve the subSection element of the of the specified field element
	// fieldElement - the field element to start the search from
	// isSkipCreate - (optional) if an exception should be thrown if the subSection element cannot be found
	findFieldSubSectionElement: function(fieldElement, isSkipCreate) {
		var subSectionElement = null;

		// check if field element exists
		fieldElement = $(fieldElement);
		if (fieldElement) {
			// get subsection element in the parent
			subSectionElement = fieldElement.up('.subsection');
			if (! subSectionElement) {
				if (! isSkipCreate) {
					throw('findFieldSubSectionElement - subSectionElement does not exist');
				}
			}
		} else {
			if (! isSkipCreate) {
				throw('findFieldSubSectionElement - fieldElement does not exist');
			}
		}

		return subSectionElement;
	},
	// section/field status messages - helper functions - find element - end

	// section/field status messages - helper functions - message element - begin
	// retrieve the section message element of the of the specified startElement
	// startElement - the element to start the search from
	// isSkipCreate - (optional) if an exception should be thrown if the section element cannot be found
	getSectionMessageElement: function(startElement, isSkipCreate) {
		var messageElement = null;

		// check if section element exists
		var sectionElement = UCPForm.seekClassElement(startElement, 'section');
		if (sectionElement) {
			// check if sectionMessage element already exists
			messageElement = sectionElement.down('.sectionMessage');
			if (! messageElement) {
				messageElement = new Element('div', {'class': 'sectionMessage statusMessage'});
				sectionElement.insert({'top': messageElement});
			}
		} else {
			if (! isSkipCreate) {
				throw('section does not exist when calling getSectionMessageElement');
			}
		}

		return messageElement;
	},
	// retrieve the subSection message element of the of the specified startElement
	// startElement - the element to start the search from
	// isSkipCreate - (optional) if an exception should be thrown if the subSection element cannot be found
	getSubSectionMessageElement: function(startElement, isSkipCreate) {
		var messageElement = null;

		// check if subSection element exists
		var subSectionElement = UCPForm.seekClassElement(startElement, 'subsection');
		if (subSectionElement) {
			// check if subsectionMessage element already exists
			messageElement = subSectionElement.down('.subsectionMessage');
			if (! messageElement) {
				messageElement = new Element('div', {'class': 'subsectionMessage statusMessage'});
				subSectionElement.insert({'top': messageElement});
			}
		} else {
			if (! isSkipCreate) {
				throw('subSection does not exist when calling getSubSectionMessageElement');
			}
		}

		return messageElement;
	},
	// section/field status messages - helper functions - message element - end

	// section/field status messages - helper functions - status class - begin
	clearElementStatusClass: function(element) {
		element.removeClassName('error');
		element.removeClassName('success');
	},
	setElementStatusClass: function(element, isErrorStatus) {
		element.removeClassName((! isErrorStatus) ? 'error': 'success');
		element.addClassName((isErrorStatus) ? 'error': 'success');
	},
	// section/field status messages - helper functions - status class - end
	// section/field status messages - helper functions - end

	// section/field status messages - clear messages - begin
	// clear status class from section element, and clear message
	clearSectionMessage: function(sectionElement) {
		sectionElement = $(sectionElement);

		// section message
		var sectionMessageElement = UCPForm.getSectionMessageElement(sectionElement, true);
		if (sectionMessageElement) {
			// hide message
			sectionMessageElement.hide();
			// clear section message status class
			UCPForm.clearElementStatusClass(sectionMessageElement);
			// clear message
			sectionMessageElement.update();

			// clear status class on changed and error fields
			var clearFieldList = sectionElement.select(
				'.fieldChanged',
				'.error'
			);
			clearFieldList.each( function(field) {
				UCPForm.clearElementStatusClass(field);
			});
		}
	},
	// clear status class from subsection element, and clear message
	clearSubSectionMessage: function(subSectionElement) {
		subSectionElement = $(subSectionElement);

		// subSection message
		var subSectionMessageElement = UCPForm.getSubSectionMessageElement(subSectionElement, true);
		if (subSectionMessageElement) {
			// hide message
			subSectionMessageElement.hide();
			// clear subSection message status class
			UCPForm.clearElementStatusClass(subSectionMessageElement);
			// clear message
			subSectionMessageElement.update();

			// clear status class on changed and error fields
			var clearFieldList = subSectionElement.select(
				'.fieldChanged',
				'.error'
			);
			clearFieldList.each( function(field) {
				UCPForm.clearElementStatusClass(field);
			});
		}
	},
	// clear status class from subsection element and field element, and clear message
	clearFieldMessage: function(fieldElement) {
		fieldElement = $(fieldElement);

		// subsection
		var subSectionElement = UCPForm.findFieldSubSectionElement(fieldElement, false);
		// clear subsection status class
		UCPForm.clearElementStatusClass(subSectionElement);

		// subSection message
		var subSectionMessageElement = UCPForm.getSubSectionMessageElement(subSectionElement, true);
		if (subSectionMessageElement) {
			// hide message
			subSectionMessageElement.hide();
			// set message
			subSectionMessageElement.update();
		}

		// field
		if (fieldElement) {
			// clear field status class
			UCPForm.clearElementStatusClass(fieldElement);
		}
	},
	// section/field status messages - clear messages - end

	// section/field status messages - set messages - begin
	// set the section message (as a messageList) for the specified startElement (section element)
	// startElement - the element to set the message for
	// messageList - list of messages to set the startElement for
	// isSkipScrollTo - (optional) skip scrolling to the message
	setSectionMessageList: function(startElement, messageList, isSkipScrollTo) {
		// section message
		var containerMessageElement = UCPForm.getSectionMessageElement(startElement, false);
		return UCPForm.setContainerMessageList(containerMessageElement, messageList, isSkipScrollTo);
	},
	// set the subSection message (as a messageList) for the specified startElement (subSection element)
	// startElement - the element to set the message for
	// messageList - list of messages to set the startElement for
	// isSkipScrollTo - (optional) skip scrolling to the message
	setSubSectionMessageList: function(startElement, messageList, isSkipScrollTo) {
		// subSection message
		var containerMessageElement = UCPForm.getSubSectionMessageElement(startElement, false);
		return UCPForm.setContainerMessageList(containerMessageElement, messageList, isSkipScrollTo);
	},
	// set the container message (as a messageList) for the specified startElement (container element)
	// containerMessageElement - the element to set the message in
	// messageList - list of messages to set the startElement for
	// isSkipScrollTo - (optional) skip scrolling to the message
	setContainerMessageList: function(containerMessageElement, messageList, isSkipScrollTo) {
		var messageErrorList = messageList.error;
		var isErrorStatus = (messageErrorList.length > 0);
		var messageArray = (isErrorStatus) ? messageErrorList : messageList.ok;
		var messageString = messageArray.join('<br />');

		// set message
		containerMessageElement.hide();
		containerMessageElement.update(messageString);
		// set container message status class
		UCPForm.setElementStatusClass(containerMessageElement, isErrorStatus);
		// show message
		containerMessageElement.show();

		// scroll-to message
		if (! isSkipScrollTo) {
			UCPForm.scrollToVertical(containerMessageElement);
		}

		return containerMessageElement;
	},
	// set the section message for the specified startElement (section element)
	// startElement - the element to set the message for
	// message - message to set the startElement for
	// isErrorStatus - if the status of the message is error or not (success)
	// isSkipScrollTo - (optional) skip scrolling to the message
	setSectionMessage: function(startElement, message, isErrorStatus, isSkipScrollTo) {
		// section message
		var sectionMessageElement = UCPForm.getSectionMessageElement(startElement, false);
		sectionMessageElement.hide();
		// convert message hash to message string
		if (typeof message === 'object') {
			message = UCPForm.convertMessageHashToHTMLString(message, isErrorStatus);
		}
		// set message
		sectionMessageElement.update(message);
		// set section message status class
		UCPForm.setElementStatusClass(sectionMessageElement, isErrorStatus);
		// show message
		sectionMessageElement.show();

		// scroll-to message
		if (! isSkipScrollTo) {
			UCPForm.scrollToVertical(sectionMessageElement);
		}

		return sectionMessageElement;
	},
	// set the subSection message for the specified startElement (subSection element)
	// startElement - the element to set the message for
	// message - message to set the startElement for
	// isErrorStatus - if the status of the message is error or not (success)
	// isSkipScrollTo - (optional) skip scrolling to the message
	setSubSectionMessage: function(startElement, message, isErrorStatus, isSkipScrollTo) {
		// subSection message
		var subSectionMessageElement = UCPForm.getSubSectionMessageElement(startElement, false);
		subSectionMessageElement.hide();
		// convert message hash to message string
		if (typeof message === 'object') {
			message = UCPForm.convertMessageHashToHTMLString(message, isErrorStatus);
		}
		// set message
		subSectionMessageElement.update(message);
		// set subSection message status class
		UCPForm.setElementStatusClass(subSectionMessageElement, isErrorStatus);
		// show message
		subSectionMessageElement.show();

		// subSection container
		var subSectionElement = UCPForm.seekClassElement(startElement, 'subsection');
		if (subSectionElement) {
			// set subSection message status class
			UCPForm.setElementStatusClass(subSectionElement, isErrorStatus);
		}

		// scroll-to message
		if (! isSkipScrollTo) {
			UCPForm.scrollToVertical(subSectionMessageElement);
		}

		return subSectionMessageElement;
	},
	// set the subSection message for the specified fieldElement
	// fieldElement - the element to set the message for
	// message - message to set the startElement for
	// isErrorStatus - if the status of the message is error or not (success)
	// isSkipScrollTo - (optional) skip scrolling to the message
	setFieldMessage: function(fieldElement, message, isErrorStatus, isSkipScrollTo) {
		// subsection
		var subSectionElement = UCPForm.findFieldSubSectionElement(fieldElement, false);
		UCPForm.setElementStatusClass(subSectionElement, isErrorStatus);

		// subSection message
		var subSectionMessageElement = UCPForm.getSubSectionMessageElement(subSectionElement, false);
		// convert message hash to message string
		if (typeof message === 'object') {
			message = UCPForm.convertMessageHashToHTMLString(message, isErrorStatus);
		}
		// set message
		subSectionMessageElement.hide();
		subSectionMessageElement.update(message);
		// set message status
		UCPForm.setElementStatusClass(subSectionMessageElement, isErrorStatus);
		// show message
		subSectionMessageElement.show();

		// field
		// set field status class
		UCPForm.setElementStatusClass(fieldElement, isErrorStatus);

		// scroll-to message
		if (! isSkipScrollTo) {
			UCPForm.scrollToVertical(subSectionMessageElement);
		}

		return subSectionMessageElement;
	},

	// section/field status messages - set messages - helper - begin
	convertMessageHashToHTMLString: function(messageHash, isErrorStatus) {
		var messageString = messageHash[UCPForm.STATUS_MESSAGE_TEXT] || '';

		var fieldMessageList = messageHash[UCPForm.STATUS_MESSAGE_FIELD_LIST];
		if (fieldMessageList) {
			messageString += '<ul class="statusMessageFieldList">';

			$H(fieldMessageList).each( function(field) {
				var fieldId = field.key;
				var fieldElement = $(fieldId);

				if (fieldElement) {
					// set field error status class
					UCPForm.setElementStatusClass(fieldElement, isErrorStatus);

					var fieldValue = field.value;
					messageString += '<li>' + fieldValue + '</li>';
				}
			});

			messageString += '</ul>';
		}

		return messageString;
	},
	setSectionMessageSuccess: function(sectionElement, message, isSkipScrollTo) {
		return UCPForm.setSectionMessage(sectionElement, message, false, isSkipScrollTo);
	},
	setSectionMessageError: function(sectionElement, message, isSkipScrollTo) {
		return UCPForm.setSectionMessage(sectionElement, message, true, isSkipScrollTo);
	},
	setSubSectionMessageSuccess: function(subSectionElement, message, isSkipScrollTo) {
		return UCPForm.setSubSectionMessage(subSectionElement, message, false, isSkipScrollTo);
	},
	setSubSectionMessageError: function(subSectionElement, message, isSkipScrollTo) {
		return UCPForm.setSubSectionMessage(subSectionElement, message, true, isSkipScrollTo);
	},
	setFieldMessageSuccess: function(fieldElement, message, isSkipScrollTo) {
		return UCPForm.setFieldMessage(fieldElement, message, false, isSkipScrollTo);
	},
	setFieldMessageError: function(fieldElement, message, isSkipScrollTo) {
		return UCPForm.setFieldMessage(fieldElement, message, true, isSkipScrollTo);
	},
	// section/field status messages - set messages - helper - end
	// section/field status messages - set messages - end

	// this function exists because Element.scrollTo() scrolled right for field messages when the screen was on the left edge
	scrollToVertical: function(toElement) {
		var cumulativeOffset = toElement.cumulativeOffset();
		var cumulativeOffsetTop = cumulativeOffset.top;
		var scrollOffsetTop = document.viewport.getScrollOffsets().top;
		if (scrollOffsetTop > cumulativeOffsetTop || cumulativeOffsetTop > (document.viewport.getHeight() + scrollOffsetTop)) {
			window.scrollTo(0, cumulativeOffsetTop);
		}
	}
	// section/field status messages - end
};
// Element.addMethods is needed for Element.invoke. Element.addMethods for 'UCPForm.clearFieldMessage' needs to be declared after UCPForm is defined
Element.addMethods('input', {
	'setFieldMessageError': UCPForm.setFieldMessageError,
	'clearFieldMessage': UCPForm.clearFieldMessage
});

var UCPCookies = {
	setValue: function(key, value, expireDays) {
		var expiryDate = new Date();
		expiryDate.setDate(expiryDate.getDate() + expireDays);
		document.cookie = key + '=' + escape(value) + ';path=/' +
			( (expireDays) ? ';expires=' + expiryDate.toGMTString() : '' );
	},
	getValue: function(key, defaultValue) {
		var value = defaultValue;

		var cookies = document.cookie.split('; ');
		for (var i=0; i<cookies.length; i++) {
			var cookie = cookies[i].split('=');
			if (cookie[0] === key) {
				value = unescape(cookie[1]);
				break;
			}
		}

		return value;
	}
};

function instanceSelectionChange(e) {
	var origURL = document.location.href;
	var currentUserInstanceId = PageScope.getKey('userInstanceId');
	var newUserInstanceIdParam = $F(e.findElement());
	var newURL = origURL.replace('/' + currentUserInstanceId + '/', '/' + newUserInstanceIdParam + '/');
	document.location = newURL;
}

/* sets the focus flag based on prototype event handler */
function setFocus(e) {
	var myInput = Event.element(e);
	if (e.type == 'blur') {
		myInput.hasFocus = false;
	} else if (e.type == 'focus') {
		myInput.hasFocus = true;
	}
}

/* convert a form inputs live input into lowercase
should be bound to the keyup event */
function inputToLowerCase(e) {
	var myField = Event.element(e);
	myField.value = myField.value.toLowerCase();
}

/* we want to keep track of which elements have focus. There is no built in
object property to do this, so we'll do it ourselves */
function setFocusFlag(inputs) {
	inputs.each(function(input) {
		input.hasFocus = false;
	});
}

/* get the right x coordinate of an element */
function getRight(element) {
	var el = $(element);
	var right = 0;
	right += el.getWidth();
	right += el.cumulativeOffset().left;
	return right;
}

findFieldWrapper = function(myField) {
	// if we are a row, look for a field to latch on to
	if (!myField.hasClassName("group") && !myField.match("form")) {
		myField = myField.up(".group");
	}
	return myField;
};

/* show a field as processing */
function showProcessing(myField) {
	var myFieldSet = findFieldWrapper(myField);

	/* we don't want to disable select boxes as they break IE7 in a bunch of weird ways
	besides, we know the values in a select box are valid if we are doing client side validation */
	var myFields = myFieldSet.getElementsBySelector("input, button, textarea");
	myFields.invoke('disable');
	myFieldSet.insert({bottom: fieldProcessing});
}

function showProcessingForm(myForm) {
	myForm = $(myForm);
	myForm.disable();
	showProcessingContainer(myForm, null, true);
}

function showProcessingContainer(topLeftContainer, bottomRightContainer, isShow) {
	topLeftContainer = $(topLeftContainer);
	bottomRightContainer = (bottomRightContainer) ? $(bottomRightContainer) : topLeftContainer;

	var overlayElementId = topLeftContainer.id + '_Overlay';
	var overlayElement = $(overlayElementId);

	if (isShow) {
		var height = topLeftContainer.getHeight();
		if (height < 1) {
			// there are no results to overlay yet, so just show spinner
			bottomRightContainer.insert(loading);
		} else {
			// results exists, so overlay
			if (! overlayElement) {
				// overlay element does not exists yet, so create it
				overlayElement = new Element('div', {'id': overlayElementId, 'class': 'spinnerOverlay'});
				topLeftContainer.insert({'bottom': overlayElement});
			}

			overlayElement.clonePosition(topLeftContainer);
			overlayElement.show().setOpacity(0.5);
		}
	} else {
		if (overlayElement) {
			overlayElement.hide();
		}
	}
}

/* remove processing display from showProcessing */
function stopProcessing(myField) {
	var myFieldSet = findFieldWrapper(myField);
	var myFields = myFieldSet.getElementsBySelector("input, button, textarea");
	myFields.invoke('enable');
	if (myFieldSet) {
		myFieldSet.down(".processing").remove();
	}
}

function stopProcessingForm(myForm) {
	myForm = $(myForm);
	// only re-enabled that were not already flag disabled by the css class 'isDisabled'
	myForm.getElements().each( function(field) {
		if (field.hasClassName('isDisabled') !== true) {
			field.enable();
		}
	});
	showProcessingContainer(myForm, null, false);
}

// utility class to provide a consistent ui behaviour when performing ajax requests
var AjaxFetch = {
	// constants - begin
	// constants - private - begin
	// containerElementType flags returned by detectFetchConfig
	CONTAINER_ELEMENT_TYPE_DEFAULT: 'default',
	CONTAINER_ELEMENT_TYPE_CONTAINER: 'container',
	CONTAINER_ELEMENT_TYPE_FORM: 'form',
	CONTAINER_ELEMENT_TYPE_FIELD: 'field',
	// constants - private - end
	// constants - end

	// methods - begin
	// methods - private methods - begin
	// performs the actual ajax request and response for json. supports bulk fetching
	// cfg - AjaxFetch config object
	submitJSON: function(cfg) {
		cfg.resetBulk();	// reset bulk state

		var subFormList = cfg.getSubFormList();
		subFormList.each( function(subFormCfg, formIndex) {
			// check if form has been modified
			var subFormListSize = subFormList.size();
			if (subFormListSize > 1) {
				var submitForm = cfg.getForm(formIndex);
				var isModified = UCPForm.isFormModified(submitForm);
				if (! isModified) {
					cfg.nextStartCount();	// increment start counter
					return;	// continue to next iteration
				}
			}

			// callback before submitting ajax request ajax event
			var performSubmit = cfg.onSubmitBefore(formIndex);
			if (performSubmit === true) {
				var requestURL = cfg.getRequestURL(formIndex);
				if (! requestURL) {
					throw('AjaxFetch.submitJSON requestURL is false/empty');
				}
				new Ajax.Request(requestURL, {
					parameters:	cfg.getRequestParameters(formIndex),
					method:	cfg.getRequestMethod(formIndex),
					onSuccess: function(response) {
						var rj = response.responseJSON;

						// callback at the start of onSuccess/onFailure ajax event
						cfg.onStart(rj, formIndex);

						// callback at the start of processing onSuccess ajax event
						cfg.onSuccessStart(rj, formIndex);

						// if operation successful
						if (rj.success == 1) {
							// callback at the start of processing successful operation
							cfg.onOkStart(rj, formIndex);

							// callback at the end of processing successful operation
							cfg.onOkEnd(rj, formIndex);
						} else {
							// callback at the start of processing error operation
							cfg.onErrorStart(rj, formIndex);

							// handle timeouts
							handleTimeout(rj, formIndex);

							// callback at the start of processing error operation
							cfg.onErrorEnd(rj, formIndex);
						}

						// callback at the end of processing onSuccess ajax event
						cfg.onSuccessEnd(rj, formIndex);

						// callback at the end of onSuccess/onFailure ajax event
						cfg.onEnd(rj, formIndex);
					},
					onFailure: function(response) {
						var rj = response.responseJSON;

						// callback at the start of onSuccess/onFailure ajax event
						cfg.onStart(rj, formIndex);

						// callback at the start of processing onFailure ajax event
						cfg.onFailureStart(rj, formIndex);

						// callback at the end of processing onFailure ajax event
						cfg.onFailureEnd(rj, formIndex);

						// callback at the end of onSuccess/onFailure ajax event
						cfg.onEnd(rj, formIndex);
					},
					onException: function(request, ex) {
						if (typeof ex === 'object') {
							window.error('AjaxFetch.submitJSON.onException - [request]=>[' + request + ']; [ex.message]=>[' + ex.message + ']; [ex.fileName]=>[' + ex.fileName + ']; [ex.lineNumber]=>[' + ex.lineNumber + ']; [ex.stack]=>[' + ex.stack + ']');
						} else {
							window.error('AjaxFetch.submitJSON.onException - [request]=>[' + request + ']; [ex.message]=>[' + ex + ']');
						}
					}
				});

				// callback after submitting ajax request ajax event
				cfg.onSubmitAfter(formIndex);
			}
		});
	},

	// performs the actual ajax request and response for inplace. supports bulk fetching
	// cfg - AjaxFetch config object
	submitInPlace: function(cfg) {
		cfg.resetBulk();	// reset bulk state

		var subFormList = cfg.getSubFormList();
		subFormList.each( function(subFormCfg, formIndex) {
			// callback before submitting ajax request ajax event
			var performSubmit = cfg.onSubmitBefore(formIndex);
			if (performSubmit === true) {
				var requestURL = cfg.getRequestURL(formIndex);
				if (! requestURL) {
					throw('AjaxFetch.submitInPlace requestURL is false/empty');
				}
				new Ajax.Updater('content', requestURL, {
					evalScripts: true,
					parameters:	cfg.getRequestParameters(formIndex),
					method:	cfg.getRequestMethod(formIndex),
					onComplete: function(response) {
						// callback at the start of onSuccess/onFailure ajax event
						cfg.onStart(response, formIndex);

						// callback at the start of processing onSuccess ajax event
						cfg.onSuccessStart(response, formIndex);

						// if operation successful
						if (response.responseText) {
							// callback at the start of processing successful operation
							cfg.onOkStart(response, formIndex);

							// callback at the end of processing successful operation
							cfg.onOkEnd(response, formIndex);
						} else {
							// callback at the start of processing error operation
							cfg.onErrorStart(response, formIndex);

							// handle timeouts
							handleTimeout(response, formIndex);

							// callback at the start of processing error operation
							cfg.onErrorEnd(response, formIndex);
						}

						// callback at the end of processing onSuccess ajax event
						cfg.onSuccessEnd(response, formIndex);

						// callback at the end of onSuccess/onFailure ajax event
						cfg.onEnd(response, formIndex);
					},
					onFailure: function(response) {
						// callback at the start of onSuccess/onFailure ajax event
						cfg.onStart(response, formIndex);

						// callback at the start of processing onFailure ajax event
						cfg.onFailureStart(response, formIndex);

						// callback at the end of processing onFailure ajax event
						cfg.onFailureEnd(response, formIndex);

						// callback at the end of onSuccess/onFailure ajax event
						cfg.onEnd(response, formIndex);
					},
					onException: function(request, ex) {
						window.error('AjaxFetch.submitInPlace.onException - [request]=>[' + request + ']; [ex.message]=>[' + ex.message + ']; [ex.fileName]=>[' + ex.fileName + ']; [ex.lineNumber]=>[' + ex.lineNumber + ']; [ex.stack]=>[' + ex.stack + ']');
					}
				});

				// callback after submitting ajax request ajax event
				cfg.onSubmitAfter(formIndex);
			}
		});
	},

	detectFetchConfig: function(eventName, url, allowShowProcessing, settings, elements) {
		var container = null;
		var form = null;
		var field = null;
		var bindElement = null;
		if (elements) {
			if (elements.container) {
				container = elements.container;
			}

			if (elements.form) {
				form = elements.form;
			}

			if (elements.field) {
				field = elements.field;
			}

			if (elements.bindElement) {
				bindElement = $(elements.bindElement);
			}
		}

		// helper to convert function into config type as onOkEnd event
		var options = (typeof settings === 'function') ?
			{ 'onOkStart': settings } :
			settings;

		if (form) {
			form = $(form);	// make sure form is extended
		}

		var containerElementType = AjaxFetch.CONTAINER_ELEMENT_TYPE_DEFAULT;
		var containerElement = null;	// associated element
		if (container) {
			containerElementType = AjaxFetch.CONTAINER_ELEMENT_TYPE_CONTAINER;

			containerElement = $(container);	// set extended container to element. make sure container is extended
		} else if (field) {
			containerElementType = AjaxFetch.CONTAINER_ELEMENT_TYPE_FIELD;

			containerElement = form;	// set form to containerElement. form should already be extended. form is probably null/undefined anyways
			bindElement = $(field);	// over-ride bindElement by setting field to bindElement. make sure field is extended
		} else if (form) {
			containerElementType = AjaxFetch.CONTAINER_ELEMENT_TYPE_FORM;

			containerElement = form;	// set form to containerElement. form should already be extended
		}

		if ( (! bindElement) && (containerElement) ) {
			bindElement = containerElement;
		}

		return {
			'containerElementType': containerElementType,
			'containerElement': containerElement,
			'bindElement': bindElement,
			'options': options
		};
	},

	fetch: function(fetchSubmitHandlerName, eventName, url, allowShowProcessing, settings, elements) {
		var fetchConfig = AjaxFetch.detectFetchConfig(eventName, url, allowShowProcessing, settings, elements);
		var containerElementType = fetchConfig.containerElementType;
		var containerElement = fetchConfig.containerElement;
		var bindElement = fetchConfig.bindElement;
		var options = fetchConfig.options;

		var isInPlace = false;
		var hasSubFormList = false;
		if (options) {
			isInPlace = (options.isInPlace === true);
			hasSubFormList = (options.subFormList) ? true : false;
		}

		var cfg = null;
		if (isInPlace) {
			// inPlace behaviour
			cfg = new AjaxFetch.InPlaceConfig(url, options, containerElement);
		} else if (hasSubFormList) {
			// subFormList behaviour
			cfg = new AjaxFetch.SubFormListConfig(url, options, containerElement);
		} else {
			switch (containerElementType) {
				case AjaxFetch.CONTAINER_ELEMENT_TYPE_CONTAINER:
					// container behaviour
					cfg = new AjaxFetch.ContainerConfig(url, options, containerElement);
					break;
				case AjaxFetch.CONTAINER_ELEMENT_TYPE_FORM:
					// form behaviour
					cfg = new AjaxFetch.FormConfig(url, options, containerElement);
					break;
				case AjaxFetch.CONTAINER_ELEMENT_TYPE_FIELD:
					// field behaviour
					cfg = new AjaxFetch.FieldConfig(options, containerElement);
					break;
				default:
					// loadData behaviour
					cfg = new AjaxFetch.LoadConfig(url, options);
					break;
			}
		}

		if (allowShowProcessing === true) {
			// default for allowShowProcessing and allowStopProcessing is false, set to true
			cfg.setAllowShowProcessing(true);
			cfg.setAllowStopProcessing(true);

			// default to show ajax ok-status message
			var allowShowAjaxOkMessage = true;
			if ( (options) && (options.allowShowAjaxOkMessage === false) ) {
				allowShowAjaxOkMessage = false;
			}
			cfg.setAllowShowAjaxOkMessage(allowShowAjaxOkMessage);
		} else {
			cfg.setRequestMethod('get');	// AjaxFetch.load* methods, which set allowShowProcessing to false, use request method 'get'
		}

		if (hasSubFormList) {
			cfg.setSubFormList(options.subFormList);
		}

		if (eventName) {
			if (bindElement) {
				// IE does not support change event on checkboxes in any sane way
				if ( (Prototype.Browser.IE) && (bindElement.type == "checkbox") && (eventName == "change") ) {
					eventName = "click";
				}
			
				// bind element to specified event
				bindElement.observe(eventName, function(e) {
					// we don't want to stop the click event for IE on checkboxes
					if ( !((Prototype.Browser.IE) && (bindElement.type == "checkbox") && (eventName == "click")) ) {
						e.stop();
					}

					cfg.setEvent(e);	// processFieldOnChange needs the eventObject to determine the form and field element
					AjaxFetch[fetchSubmitHandlerName](cfg);
				});
			} else {
				throw('AjaxFetch.fetch - eventName specified, but bindElement is not true. [eventName]=>[' + eventName + ']; [bindElement]=>[' + bindElement + ']; [url]=>[' + url + ']');
			}
		} else {
			// no event specified, submit now
			AjaxFetch[fetchSubmitHandlerName](cfg);
		}
	},
	// methods - private methods - end

	// AjaxFetch notes
	// ===============
	// load* vs. process* methods
	// --------------------------
	// process* methods show the processing spinners where as load* methods don't show processing spinners
	//
	// container vs. form/field
	// ------------------------
	// if a form/field container is specified instead of a generic container like 'div',
	// the AjaxFetch config classes AjaxFetch.FormConfig and AjaxFetch.FieldConfig provides addition capabilities like...
	// - detecting the form request url if the url is not specified on function call
	// - serializing form parameters
	//
	// AjaxFetch settings hash
	// -----------------------
	// AjaxFetch settings hash keys include:
	// - callback handlers defined in submitJSON method (e.g. hash keys 'onSubmitBefore', 'onOkStart', 'onEnd', etc.)
	// - fields/methods defined in the AjaxFetch config classes (e.g. hash key 'bind' for the AjaxFetch.LoadConfig.getBind() method)
	// - flags supported by the AjaxFetch config classes (e.g. hash key 'isSerializeHash' for the AjaxFetch.FormConfig class)

	// methods - public methods - begin
	// methods - public methods - load methods (e.g. no spinner) - begin
	// just fetch the data. does not have any ui representation
	// url - fetch request url
	// settings - AjaxFetch settings hash (optional)
	loadData: function(url, settings) {
		AjaxFetch.fetch(
			'submitJSON',	// fetchSubmitHandlerName
			null,	// eventName
			url,	// url
			false,	// allowShowProcessing
			settings,	// settings
			null	// elements
		);
	},
	// fetch the data and shows errors with the associated container
	// container - container id string, or element object of the container
	// url - fetch request url
	// settings - AjaxFetch settings hash (optional)
	loadContainerNoEvent: function(container, url, settings) {
		AjaxFetch.fetch(
			'submitJSON',	// fetchSubmitHandlerName
			null,	// eventName
			url,	// url
			false,	// allowShowProcessing
			settings,	// settings
			// elements
			{
				'container': container
			}
		);
	},
	// fetch the data and shows errors with the associated form
	// form - form id string, or element object of the form
	// url - fetch request url
	// settings - AjaxFetch settings hash (optional)
	loadFormNoEvent: function(form, url, settings) {
		AjaxFetch.fetch(
			'submitJSON',	// fetchSubmitHandlerName
			null,	// eventName
			url,	// url
			false,	// allowShowProcessing
			settings,	// settings
			// elements
			{
				'form': form
			}
		);
	},
	// fetch the data and shows errors with the associated form.
	// fetch is triggered when the specified form event occurs
	// eventName - form event name that triggers the fetch
	// form - form id string, or element object of the form
	// url - fetch request url
	// settings - AjaxFetch settings hash (optional)
	loadFormOnEvent: function(eventName, form, url, settings) {
		AjaxFetch.fetch(
			'submitJSON',	// fetchSubmitHandlerName
			eventName,	// eventName
			url,	// url
			false,	// allowShowProcessing
			settings,	// settings
			// elements
			{
				'form': form
			}
		);
	},

	// bind event to a button and have x happen
	processFieldBindElementOnEvent: function(eventName, bindElement, field, url, settings) {
		AjaxFetch.fetch(
			eventName,	// eventName
			url,	// url
			true,	// allowShowProcessing
			settings,	// settings
			// elements
			{
				'bindElement': bindElement,
				'field': field
			}
		);
	},
	// fetch the data and shows errors with the associated form.
	// fetch is triggered when the specified event occurs on the bindElement
	// eventName - form event name that triggers the fetch
	// bindElement - element id string, or element object of the element to trigger the event
	// form - form id string, or element object of the form
	// url - fetch request url
	// settings - AjaxFetch settings hash (optional)
	loadFormBindElementOnEvent: function(eventName, bindElement, form, url, settings) {
		AjaxFetch.fetch(
			'submitJSON',	// fetchSubmitHandlerName
			eventName,	// eventName
			url,	// url
			false,	// allowShowProcessing
			settings,	// settings
			// elements
			{
				'bindElement': bindElement,
				'form': form
			}
		);
	},
	// methods - public methods - load methods (e.g. no spinner) - end

	// methods - public methods - process methods (e.g. with spinner) - begin
	// fetch the data with a spinner, and shows errors with the associated container
	// container - container id string, or element object of the container
	// url - fetch request url
	// settings - AjaxFetch settings hash (optional)
	processContainerNoEvent: function(container, url, settings) {
		AjaxFetch.fetch(
			'submitJSON',	// fetchSubmitHandlerName
			null,	// eventName
			url,	// url
			true,	// allowShowProcessing
			settings,	// settings
			// elements
			{
				'container': container
			}
		);
	},
	// fetch the data with a spinner, and shows errors with the associated form
	// ok-status messages can be disabled in the specified config
	// form - form id string, or element object of the form
	// settings - AjaxFetch settings hash (optional)
	processFormNoEvent: function(form, settings) {
		AjaxFetch.fetch(
			'submitJSON',	// fetchSubmitHandlerName
			null,	// eventName
			null,	// url
			true,	// allowShowProcessing
			settings,	// settings
			// elements
			{
				'form': form
			}
		);
	},
	// fetch the data with a spinner, and shows errors with the associated form.
	// fetch is triggered when the specified form event occurs
	// eventName - form event name that triggers the fetch
	// form - form id string, or element object of the form
	// url - fetch request url
	// settings - AjaxFetch settings hash (optional)
	processFormOnEvent: function(eventName, form, url, settings) {
		AjaxFetch.fetch(
			'submitJSON',	// fetchSubmitHandlerName
			eventName,	// eventName
			url,	// url
			true,	// allowShowProcessing
			settings,	// settings
			// elements
			{
				'form': form
			}
		);
	},
	// fetch the data with a spinner, and shows errors with the associated form.
	// fetch is triggered when the specified form event occurs on the bindElement
	// eventName - form event name that triggers the fetch
	// bindElement - element id string, or element object of the element to trigger the event
	// form - form id string, or element object of the form
	// url - fetch request url
	// settings - AjaxFetch settings hash (optional)
	processFormBindElementOnEvent: function(eventName, bindElement, form, url, settings) {
		AjaxFetch.fetch(
			'submitJSON',	// fetchSubmitHandlerName
			eventName,	// eventName
			url,	// url
			true,	// allowShowProcessing
			settings,	// settings
			// elements
			{
				'bindElement': bindElement,
				'form': form
			}
		);
	},
	// fetch the data with a spinner, and shows errors with the associated form.
	// fetch is triggered when the submit form event occurs
	// eventName - form event name that triggers the fetch
	// form - form id string, or element object of the form
	// url - fetch request url
	// settings - AjaxFetch settings hash (optional)
	processFormOnSubmit: function(form, settings) {
		AjaxFetch.fetch(
			'submitJSON',	// fetchSubmitHandlerName
			'submit',	// eventName
			null,	// url
			true,	// allowShowProcessing
			settings,	// settings
			// elements
			{
				'form': form
			}
		);
	},
	// fetch the data with a spinner, and shows ok or errors with the associated field
	// ok-status messages can be disabled in the specified config
	// field - field id string, or element object of the field
	// settings - AjaxFetch settings hash (optional)
	processFieldOnChange: function(field, settings) {
		var eventName = "change";
		AjaxFetch.fetch(
			'submitJSON',	// fetchSubmitHandlerName
			eventName,	// event
			null,	// url
			true,	// allowShowProcessing
			settings,	// settings
			// elements
			{
				'field': field
			}
		);
	},
	// methods - public methods - process methods (e.g. with spinner) - bulk - begin
	// fetch the data with a spinner, and shows errors with the associated form.
	// fetch is triggered when the specified form event occurs on the bindElement
	// ** supports multiple forms by specifying array list of forms in settings hash key 'subFormList' **
	// eventName - form event name that triggers the fetch
	// bindElement - element id string, or element object of the element to trigger the event
	// form - form id string, or element object of the form
	// url - fetch request url
	// settings - AjaxFetch settings hash (optional)
	processSubFormsBindElementOnEvent: function(eventName, bindElement, container, settings) {
		AjaxFetch.fetch(
			'submitJSON',	// fetchSubmitHandlerName
			eventName,	// eventName
			null,	// url
			true,	// allowShowProcessing
			settings,	// settings
			// elements
			{
				'bindElement': bindElement,
				'container': container
			}
		);
	},
	// methods - public methods - process methods (e.g. with spinner) - bulk - end
	// methods - public methods - process methods (e.g. with spinner) - inplace - begin
	// fetch the mainBlock with a spinner, and shows errors with the associated container
	// container - container id string, or element object of the container
	// url - fetch request url
	// settings - AjaxFetch settings hash (optional)
	processInPlaceNoEvent: function(container, settings) {
		var url = window.location.href;
		url += (url.indexOf('?') < 0) ? '?' : '&';
		url += 'inPlace=1';

		AjaxFetch.fetch(
			'submitInPlace',	// fetchSubmitHandlerName
			null,	// eventName
			url,	// url
			true,	// allowShowProcessing
			settings,	// settings
			// elements
			{
				'container': container
			}
		);
	}
	// methods - public methods - process methods (e.g. with spinner) - inplace - end
	// methods - public methods - process methods (e.g. with spinner) - end
	// methods - public methods - end
	// methods - end
};

// private AjaxFetch config classes used by AjaxFetch.fetch/AjaxFetch.fetchBulk - begin
// AjaxFetch configuration base class that is used to handle ui behaviour
AjaxFetch.LoadConfig = Class.create({
	initialize: function(requestURL, options) {
		this.setRequestURL(requestURL);

		this.ajaxMessageHash = {};
		this.setAjaxMessage('');
		this.setAjaxMessageFieldList({});

		this.parameters = '';
		this.method = '';	// initialize to empty. defaults to 'post' in getReqeustMethod
		this.options = {};

		this.event = null;	// reference to event object that triggered the fetch. there might be no event associated

		// options for spinner and messages
		this.setAllowShowProcessing(false);	// if the spinner should be shown. default is false
		this.setAllowStopProcessing(false);	// if the spinner should be stopped. default is false
		var allowShowAjaxOkMessage = false;	// if the ajax ok-status message should be shown. default is false

		var allowStatusMessageInSection = false;	// if the status message should appear in the 'section' container. default is false

		var allowInPlaceReload = false;	// if in-place window reload is allowed. default is false

		// default failure messages
		this.setAjaxFailureMessage(comErrorMessage);

		if (options) {
			this.options = options;
			this.parameters = options.parameters || '';
			if (options.method !== undefined) {
				this.method = options.method;
			}

			if (options.allowShowAjaxOkMessage !== undefined) {
				allowShowAjaxOkMessage = (options.allowShowAjaxOkMessage === true);
			}

			if (options.allowStatusMessageInSection !== undefined) {
				allowStatusMessageInSection = (options.allowStatusMessageInSection === true);
			}

			if (options.allowInPlaceReload !== undefined) {
				allowInPlaceReload = (options.allowInPlaceReload === true);
			}
		}

		this.setAllowShowAjaxOkMessage(allowShowAjaxOkMessage);
		this.setAllowStatusMessageInSection(allowStatusMessageInSection);
		this.setAllowInPlaceReload(allowInPlaceReload);
	},

	resetBulk: function() {
	},
	getSubFormList: function() {
		return [
			{
				'form': 'default'
			}
		];
	},

	reset: function() {
		// if requestURL needs to be reset
		if (this.options.resetRequestURL === true) {
			// reset requestURL
			this.setRequestURL(null);
		}

		// reset request parameters
		this.setRequestParameters('');
	},

	// getters/setters - begin
	getRequestURL: function(formIndex) {
		var requestURL = this.requestURL;

		if (! requestURL) {
			var form = this.getForm(formIndex);
			if (form) {
				requestURL = form.action || '';
				this.url = requestURL;
			}
		}

		return requestURL;
	},
	setRequestURL: function(requestURL) {
		this.requestURL = requestURL || '';
	},

	getRequestParameters: function(formIndex) {
		return this.parameters || '';
	},
	setRequestParameters: function(parameters) {
		this.parameters = parameters;
	},

	getRequestMethod: function() {
		return this.method || 'post';	// default to 'post' request method because of privacy/security
	},
	setRequestMethod: function(method) {
		this.method = method;
	},

	getStash: function(key, defaultValue) {
		var value = defaultValue;

		if (this.options[key] !== undefined) {
			value = this.options[key];
		}
		return value;
	},
	setStash: function(key, value) {
		this.options[key] = value;
	},

	getBind: function() {
		return this.getStash('bind');
	},
	setBind: function(bind) {
		this.setStash('bind', bind);
	},

	getEvent: function() {
		return this.event;
	},
	setEvent: function(event) {
		this.event = event;
	},

	setFormSaved: function() {
	},

	getAjaxMessageHash: function() {
		return this.ajaxMessageHash;
	},
	setAjaxMessageHash: function(ajaxMessageHash) {
		this.ajaxMessageHash = ajaxMessageHash;
	},

	getAjaxMessage: function() {
		return this.ajaxMessageHash[UCPForm.STATUS_MESSAGE_TEXT];
	},
	setAjaxMessage: function(ajaxMessage) {
		this.ajaxMessageHash[UCPForm.STATUS_MESSAGE_TEXT] = ajaxMessage;
	},

	getAjaxMessageFieldList: function() {
		return this.ajaxMessageHash[UCPForm.STATUS_MESSAGE_FIELD_LIST];
	},
	setAjaxMessageFieldList: function(ajaxMessageFieldList) {
		this.ajaxMessageHash[UCPForm.STATUS_MESSAGE_FIELD_LIST] = ajaxMessageFieldList;
	},

	getAjaxFailureMessage: function() {
		return this.ajaxFailureMessage;
	},
	setAjaxFailureMessage: function(ajaxFailureMessage) {
		this.ajaxFailureMessage = ajaxFailureMessage;
	},

	isAllowShowProcessing: function() {
		return this.allowShowProcessing;
	},
	setAllowShowProcessing: function(allowShowProcessing) {
		this.allowShowProcessing = (allowShowProcessing === true);
	},

	isAllowStopProcessing: function() {
		return this.allowStopProcessing;
	},
	setAllowStopProcessing: function(allowStopProcessing) {
		this.allowStopProcessing = (allowStopProcessing === true);
	},

	isAllowShowAjaxOkMessage: function() {
		return this.allowShowAjaxOkMessage;
	},
	setAllowShowAjaxOkMessage: function(allowShowAjaxOkMessage) {
		this.allowShowAjaxOkMessage = allowShowAjaxOkMessage;
	},

	isAllowStatusMessageInSection: function() {
		return this.allowStatusMessageInSection;
	},
	setAllowStatusMessageInSection: function(allowStatusMessageInSection) {
		this.allowStatusMessageInSection = allowStatusMessageInSection;
	},

	isAllowInPlaceReload: function() {
		return this.allowInPlaceReload;
	},
	setAllowInPlaceReload: function(allowInPlaceReload) {
		this.allowInPlaceReload = allowInPlaceReload;
	},
	// getters/setters - end

	// methods - begin
	// methods - spinner - begin
	showProcessing: function() {
		// silent behaviour, so empty method
	},
	stopProcessing: function(rj) {
		// silent behaviour, so empty method
	},
	// methods - spinner - end

	// methods - status/error messages - begin
	showOkMessage: function(message) {
		// silent behaviour, so empty method
	},
	showErrorMessage: function(message) {
		// silent behaviour, so empty method
	},
	showAjaxOkMessage: function(rj) {
		// if ok-status message should be shown
		if (this.isAllowShowAjaxOkMessage() === true) {
			var ajaxMessageHash = this.getAjaxMessageHash();
			this.showOkMessage(ajaxMessageHash);
		}
	},
	showAjaxErrorMessage: function(rj) {
		var ajaxMessageHash = this.getAjaxMessageHash();
		this.showErrorMessage(ajaxMessageHash);
	},
	showAjaxFailureMessage: function(rj) {
		this.showErrorMessage(this.getAjaxFailureMessage());
	},
	// methods - status/error messages - end

	// methods - event callbacks - begin
	onSubmitBefore: function(formIndex) {
		var performSubmit = true;

		// reset state
		this.reset();

		if (this.options.onSubmitBefore) {
			performSubmit = (this.options.onSubmitBefore(this) !== false) ? true : false;
		}

		if (performSubmit === true) {
			// showProcessing disables the form, so read form values before calling showProcessing
			this.getRequestParameters(formIndex);

			// if the spinner should be shown
			if (this.isAllowShowProcessing() === true) {
				// start the spinner
				this.showProcessing();
			}
		}

		return performSubmit;
	},
	onSubmitAfter: function(formIndex) {
		if (this.options.onSubmitAfter) {
			this.options.onSubmitAfter(this);
		}
	},

	onStart: function(rj, formIndex) {
		// set ajax message
		this.setAjaxMessage(rj.message);

		// set ajax field message list
		this.setAjaxMessageFieldList(rj.errors);

		// if the spinner should be shown
		if (this.isAllowStopProcessing() === true) {
			// stop the spinner
			this.stopProcessing(rj);
		}

		this.callbackHandler('onStart', rj, formIndex);
	},
	onEnd: function(rj, formIndex) {
		this.callbackHandler('onEnd', rj, formIndex);
	},

	onSuccessStart: function(rj, formIndex) {
		this.callbackHandler('onSuccessStart', rj, formIndex);
	},
	onSuccessEnd: function(rj, formIndex) {
		this.callbackHandler('onSuccessEnd', rj, formIndex);
	},

	onOkStart: function(rj, formIndex) {
		this.setFormSaved(rj, formIndex);

		this.callbackHandler('onOkStart', rj, formIndex);
	},
	onOkEnd: function(rj, formIndex) {
		// show the ajax operation message
		this.showAjaxOkMessage(rj);

		this.callbackHandler('onOkEnd', rj, formIndex);
	},

	onErrorStart: function(rj, formIndex) {
		this.callbackHandler('onErrorStart', rj, formIndex);
	},
	onErrorEnd: function(rj, formIndex) {
		// show the ajax operation error message
		this.showAjaxErrorMessage(rj);

		this.callbackHandler('onErrorEnd', rj, formIndex);
	},

	onFailureStart: function(rj, formIndex) {
		this.callbackHandler('onFailureStart', rj, formIndex);
	},
	onFailureEnd: function(rj, formIndex) {
		// show the ajax failure message
		this.showAjaxFailureMessage(rj);

		this.callbackHandler('onFailureEnd', rj, formIndex);
	},

	callbackHandler: function(callbackName, rj, formIndex) {
		var callback = this.options[callbackName];
		if (callback) {
			callback(this, rj, formIndex);
		}
	}
	// methods - event callbacks - end
	// methods - end
});

// AjaxFetch configuration sub-class that is used to handle the behaviour that is associated with a container
AjaxFetch.ContainerConfig = Class.create(AjaxFetch.LoadConfig, {
	initialize: function($super, url, options, container) {
		$super(url, options);

		this.container = container;
	},

	// getters/setters - begin
	getContainer: function() {
		return this.container;
	},
	setContainer: function(container) {
		this.container = container;
	},
	// getters/setters - end

	// methods - begin
	// methods - over-ride - begin
	// methods - over-ride - spinner - begin
	showProcessing: function($super) {
		var container = this.getContainer();

		if (this.isAllowStatusMessageInSection() === true) {
			UCPForm.clearSectionMessage(container);	// clear previous error
		} else {
			UCPForm.clearSubSectionMessage(container);	// clear previous error
		}

		showProcessingContainer(container, null, true);	// show spinner
	},
	stopProcessing: function($super, rj) {
		var container = this.getContainer();

		showProcessingContainer(container, null, false);	// hide spinner
	},
	// methods - over-ride - spinner - end

	// methods - over-ride - status/error messages - begin
	showOkMessage: function($super, message) {
		var myContainer = this.getContainer();

		if (this.isAllowStatusMessageInSection() === true) {
			UCPForm.setSectionMessageSuccess(myContainer, message);
		} else {
			UCPForm.setSubSectionMessageSuccess(myContainer, message);
		}
	},
	showErrorMessage: function($super, message) {
		var myContainer = this.getContainer();

		if (this.isAllowStatusMessageInSection() === true) {
			UCPForm.setSectionMessageError(myContainer, message);
		} else {
			UCPForm.setSubSectionMessageError(myContainer, message);
		}
	},
	// methods - over-ride - status/error messages - end

	// methods - over-ride - event callbacks - begin
	onOkEnd: function($super, rj, formIndex) {
		$super(rj, formIndex);

		if (this.isAllowInPlaceReload() === true) {
			if ( (rj.redirect_url) && (window.location.href.indexOf(rj.redirect_url) < 0) ) {
				window.location.href = rj.redirect_url;
			} else {
				var isStatusMessageInSection = this.isAllowStatusMessageInSection();
				var inPlaceMessageHash = this.getAjaxMessageHash();
				var container = this.getContainer();
				AjaxFetch.processInPlaceNoEvent(container, {
					'allowStatusMessageInSection': isStatusMessageInSection,	// show statusMessage in section
					'isInPlace': true,
					'inPlaceMessageHash': inPlaceMessageHash
				});
			}
		}
	}
	// methods - over-ride - event callbacks - end
	// methods - over-ride - end
	// methods - end
});

// AjaxFetch configuration sub-class that is used to handle the behaviour that is associated with in-place
AjaxFetch.InPlaceConfig = Class.create(AjaxFetch.ContainerConfig, {
	initialize: function($super, url, options, container) {
		$super(url, options, container);
	},

	// methods - begin
	// methods - over-ride - begin
	// methods - over-ride - event callbacks - begin
	onOkStart: function($super, response, formIndex) {
		$super(response, formIndex);

		// re-bind to replaced container
		var containerOld = this.getContainer();
		var containerNew = $(containerOld.id);
		this.setContainer(containerNew);

		var inPlaceMessageHash = this.getStash('inPlaceMessageHash');
		this.setAjaxMessageHash(inPlaceMessageHash);
	}
	// methods - over-ride - event callbacks - end
	// methods - over-ride - end
	// methods - end
});

// AjaxFetch configuration sub-class that is used to handle the 'process' type behaviour that is associated with a form
AjaxFetch.FormConfig = Class.create(AjaxFetch.ContainerConfig, {
	initialize: function($super, url, options, form) {
		$super(url, options, form);

		this.form = form;

		this.isSerializeHash = false;
		if (this.options.isSerializeHash === true) {
			this.isSerializeHash = true;
		}

		// state flags
		this.formInitiallyDisabled = false;	// if form was initially disabled, so form state is set appropriately after fetch completes
	},

	reset: function($super) {
		$super();

		// reset formInitiallyDisabled back to false
		this.setFormInitiallyDisabled(false);
	},

	// getters/setters - begin
	// getters/setters - over-ride - begin
	getRequestParameters: function($super, formIndex) {
		var parameters = '';

		if (this.parameters) {
			parameters = this.parameters;
		} else {
			var form = this.getForm(formIndex);
			parameters = form.serialize(this.isParametersSerializeHash());

			// update object field parameters
			this.parameters = parameters;
		}

		return parameters;
	},

	setFormSaved: function(rj, formIndex) {
		var form = this.getForm(formIndex);
		UCPForm.setFormModified(form, false);
	},
	// getters/setters - over-ride - end

	getForm: function() {
		return this.form;
	},
	setForm: function(form) {
		this.form = $(form);
	},

	isFormInitiallyDisabled: function() {
		return this.formInitiallyDisabled;
	},
	setFormInitiallyDisabled: function(formInitiallyDisabled) {
		this.formInitiallyDisabled = (formInitiallyDisabled === true);
	},

	isParametersSerializeHash: function() {
		return this.isSerializeHash;
	},
	// getters/setters - end

	// methods - begin
	// methods - over-ride - begin
	// methods - over-ride - spinner - begin
	showProcessing: function($super) {
		var myForm = this.getForm();

		if (this.isAllowStatusMessageInSection() === true) {
			UCPForm.clearSectionMessage(myForm);	// clear previous error
		} else {
			UCPForm.clearSubSectionMessage(myForm);	// clear previous error
		}

		showProcessingForm(myForm);	// show spinner
	},
	stopProcessing: function($super, rj) {
		var myForm = this.getForm();

		stopProcessingForm(myForm);
	}
	// methods - over-ride - spinner - end
	// methods - over-ride - end
	// methods - end
});

// AjaxFetch configuration sub-class that is used to handle the behaviour that is associated with a container
// ** supports multiple forms by specifying array list of forms in settings hash key 'subFormList' **
AjaxFetch.SubFormListConfig = Class.create(AjaxFetch.FormConfig, {
	initialize: function($super, url, options, container) {
		$super('', options, null);

		this.container = container;
		this.subFormList = null;	// array list of forms to perform bulk fetch on

		this.resetBulk();
	},

	resetBulk: function() {
		// reset messageList
		this.messageList = {
			'ok': [],
			'error': []
		};

		this.startCount = -1;	// number of fetches started. used to detech if the last form has been started/ended
	},

	// getters/setters - begin
	// getters/setters - over-ride - begin
	getForm: function($super, formIndex) {
		var subForm = this.getSubForm(formIndex);

		return subForm;
	},
	// getters/setters - over-ride - end

	getSubFormList: function() {
		return this.subFormList;
	},
	setSubFormList: function(subFormList) {
		this.subFormList = subFormList;
	},

	getSubFormCfg: function(index) {
		var subFormCfg = this.subFormList[index];
		return subFormCfg;
	},

	getSubForm: function(index) {
		var subFormCfg = this.getSubFormCfg(index);
		var form = subFormCfg.form;

		return $(form);	// make sure form is extended
	},

	getMessageList: function() {
		return this.messageList;
	},
	insertMessageOk: function(message) {
		if (typeof message === 'object') {
			message = UCPForm.convertMessageHashToHTMLString(message, false);
		}
		this.messageList.ok.push(message);
	},
	insertMessageError: function(message) {
		if (typeof message === 'object') {
			message = UCPForm.convertMessageHashToHTMLString(message, true);
		}
		this.messageList.error.push(message);
	},

	getStartCount: function() {
		return this.startCount;
	},
	nextStartCount: function() {
		return ++this.startCount;
	},

	getSubFormIndexLast: function() {
		return this.subFormList.size();
	},

	isSubFormIndexLast: function() {
		var startCount = this.getStartCount();
		var indexLast = this.getSubFormIndexLast();

		return ( (startCount + 1) >= indexLast);
	},
	// getters/setters - end

	// methods - begin
	// methods - over-ride - begin
	// methods - over-ride - spinner - begin
	showProcessing: function($super) {
		var container = this.getContainer();

		if (this.isAllowStatusMessageInSection() === true) {
			UCPForm.clearSectionMessage(container);	// clear previous error
		} else {
			UCPForm.clearSubSectionMessage(container);	// clear previous error
		}

		showProcessingContainer(container, null, true);	// show spinner
	},
	stopProcessing: function($super, rj, formIndex) {
		// if called by last subFormIndex
		if (this.isSubFormIndexLast()) {
			var container = this.getContainer();

			showProcessingContainer(container, null, false);	// hide spinner
		}
	},
	// methods - over-ride - spinner - end

	// methods - over-ride - status/error messages - begin
	showOkMessage: function($super, message) {
		this.insertMessageOk(message);
	},
	showErrorMessage: function($super, message) {
		this.insertMessageError(message);
	},
	// methods - over-ride - status/error messages - end

	// methods - over-ride - event callbacks - begin
	onStart: function($super, rj, formIndex) {
		this.nextStartCount();

		$super(rj, formIndex);
	},
	onEnd: function($super, rj, formIndex) {
		$super(rj, formIndex);

		var container = this.getContainer();
		var messageList = this.getMessageList();
		if (this.isAllowStatusMessageInSection() === true) {
			UCPForm.setSectionMessageList(container, messageList);
		} else {
			UCPForm.setSubSectionMessageList(container, messageList);
		}
	},

	callbackHandler: function($super, callbackName, rj, formIndex) {
		var subFormCfg = this.getSubFormCfg(formIndex);
		var subFormCfgCallback = subFormCfg[callbackName];
		if (subFormCfgCallback) {
			subFormCfgCallback(this, rj, formIndex);
		}

		if (this.isSubFormIndexLast()) {
			var callback = this.options[callbackName];
			if (callback) {
				callback(this, rj, formIndex);
			}
		}
	}
	// methods - over-ride - event callbacks - end
	// methods - over-ride - end
	// methods - end
});

// AjaxFetch configuration sub-class that is used to handle the 'process' type behaviour that is associated with a field
AjaxFetch.FieldConfig = Class.create(AjaxFetch.FormConfig, {
	initialize: function($super, options, form) {
		$super('', options, form);

		this.field = null;
	},

	// getters/setters - begin
	// getters/setters - over-ride - begin
	setEvent: function($super, event) {
		this.event = event;

		var myElement = event.findElement();
		var myField = null;
		var myForm = event.findElement("form");

		if (myElement.hasClassName("row")) {
			myField = findFieldWrapper(myField);
		} else if (event.findElement(".field")) {
			myField = event.findElement(".field");
		} else {
			myField = myElement;
		}

		this.form = myForm;
		this.setRequestURL(myForm.action);

		this.field = myField;
	},

	setFormSaved: function() {
		//var form = this.getForm();
		//UCPForm.setFormModified(form, false);
	},
	// getters/setters - over-ride - end

	getField: function() {
		return this.field;
	},
	setField: function(field) {
		this.field = field;
	},
	// getters/setters - end

	// methods - begin
	// methods - over-ride - begin
	// methods - over-ride - spinner - begin
	showProcessing: function($super) {
		var myField = this.getField();

		UCPForm.clearFieldMessage(myField);	// clear previous messages

		showProcessing(myField);	// show spinner
	},
	stopProcessing: function($super, rj) {
		var myField = this.getField();

		stopProcessing(myField);
	},
	// methods - over-ride - spinner - end

	// methods - over-ride - status/error messages - begin
	showOkMessage: function($super, message) {
		var myField = this.getField();

		UCPForm.setFieldMessageSuccess(myField, message);
	},
	showErrorMessage: function($super, message) {
		var myField = this.getField();

		UCPForm.setFieldMessageError(myField, message);
	}
	// methods - over-ride - status/error messages - end
	// methods - over-ride - end
	// methods - end
});
// private AjaxFetch config classes used by AjaxFetch.fetch/AjaxFetch.fetchBulk - end

/* returns a url string that is used to maintain ucp state */
function urlBuilder(urlFormat, urlValues, params) {
	var url = "";
	urlValues = $H(urlValues);

	var url_bits = $A(urlFormat);
	url_bits.each(function(url_bit) {
		if (/^%.+%$/.match(url_bit)) {
			url += "/" + urlValues.get(url_bit.substr(1, url_bit.length - 2));
		} else {
			url += "/" + url_bit;
		}
	}, this);
	url += "?";
	url += params.toQueryString();

	return url;
}

var Cache = Class.create({
	initialize: function(initParams) {
		if (initParams !== undefined) {
			this.setItemCountMax(initParams.itemCountMax);
		}

		this.clear();
	},

	// getters/setters - begin
	// same method names as prototype hash - begin
	clear: function() {
		this.itemList = $H();
	},

	get: function(key, defaultValue) {
		var value = this.itemList.get(key);

		if (value === undefined) {
			value = defaultValue;
		}

		return value;
	},
	set: function(key, value) {
		this.itemList.set(key, value);
	},
	unset: function(key) {
		this.itemList.unset(key);
	},
	// same method names as prototype hash - end

	getItemCountMax: function() {
		return this.itemCountMax;
	},
	setItemCountMax: function(itemCountMax) {
		if (itemCountMax < 0) {
			itemCountMax = 0;
		}

		this.itemCountMax = itemCountMax;
	},

	getItemCacheList: function() {
		return this.itemList.keys();
	},
	isItemCached: function(key) {
		return (this.itemList.get(key) !== undefined);
	}
	// getters/setters - end
});

Cache.LRU = Class.create(Cache, {
	// getters/setters - begin
	// getters/setters - over-ride - begin
	// same method names as prototype hash - begin
	clear: function($super) {
		$super();

		this.itemLRUList = $A();
	},

	get: function($super, key) {
		var value = $super(key);
		if (value !== undefined) {
			// cache exists, so need to update lru. skipFetch is true because value is already cached
			this.addItemLRU(key, true);
		}

		return value;
	},
	set: function($super, key, value) {
		// addItemLRU is called before $super(key, value)
		this.addItemLRU(key, false);	// skipFetch is false because value might not be cached yet

		$super(key, value);
	},
	// same method names as prototype hash - end
	// getters/setters - over-ride - end

	getFreeSpace: function() {
		return (this.getItemCountMax() - this.itemLRUList.length);
	},

	getItemCacheList: function() {
		// return itemLRUList with most recent first in array
		return this.itemLRUList.reverse();
	},
	addItemLRU: function(key, skipFetch) {
		var value = false;	// initialize to a value that is not undefined

		// optimization: skip getting from itemList multiple times
		// if value is already cached, skipFetch can be set to true
		if (skipFetch !== true) {
			value = this.itemList.get(key);
		}

		// check if value is cached
		if (value === undefined) {
			// cache does not exists. shift to make space
			this.removeOldCache(1);
		} else {
			// cache exists. remove existing lru
			for (var j=0; j<this.itemLRUList.length; j++) {
				if (this.itemLRUList[j] == key) {
					this.itemLRUList.splice(j, 1);
				}
			}
		}

		this.itemLRUList.push(key);	// push to end of lru
	},
	// getters/setters - end

	// methods - begin
	removeOldCache: function(numOfSlots) {
		var freeSpace = this.getFreeSpace();
		if (freeSpace < numOfSlots) {
			for (var i=0; i<numOfSlots; i++) {
				var keyOld = this.itemLRUList.shift();	// move space in lru
				this.itemList.unset(keyOld);	// delete old cache
			}
		}
	}
	// methods - end
});

Cache.PagePrefetch = Class.create(Cache, {
	initialize: function($super, initParams) {
		$super(initParams);

		this.itemCacheList = $A();

		this.pageRangeMin = initParams.pageRangeMin;
		this.pageRangeMax = initParams.pageRangeMax;

		this.pageNumTarget = this.pageRangeMin;

		this.onPrefetch = initParams.onPrefetch;
		this.prefetchInterval = initParams.prefetchInterval;

		this.prefetchTimer = null;
	},

	// getters/setters - begin
	// getters/setters - over-ride - begin
	// same method names as prototype hash - begin
	clear: function($super) {
		$super();

		this.prefetchList = $A();
	},

	set: function($super, key, value) {
		var pageNumTarget = this.getPageNumTarget();
		var prefetchRangeResult = this.buildPrefetchRange(pageNumTarget);
		var start = prefetchRangeResult.start;
		var stop = prefetchRangeResult.stop;

		for (var i=0; i<this.itemCacheList.length; i++) {
			var pageNum = this.itemCacheList[i];

			if ( (pageNum < start) || (stop < pageNum) ) {
				this.unset(pageNum);
				this.itemCacheList.splice(i, 1);
			}
		}

		$super(key, value);

		this.itemCacheList.push(key);
	},
	// same method names as prototype hash - end
	// getters/setters - over-ride - end

	getPageRangeMin: function() {
		return this.pageRangeMin;
	},
	setPageRangeMin: function(pageRangeMin) {
		this.pageRangeMin = pageRangeMin;
	},

	getPageRangeMax: function() {
		return this.pageRangeMax;
	},
	setPageRangeMax: function(pageRangeMax) {
		this.pageRangeMax = pageRangeMax;
	},

	buildPrefetchRange: function(pageNumTarget) {
		var itemCountMax = this.getItemCountMax();
		var bufferSlots = Math.floor(itemCountMax / 2);

		var start = pageNumTarget - bufferSlots;
		var min = this.getPageRangeMin();
		if (start < min) {
			start = min;
		}

		var stop = start + itemCountMax;
		var max = this.getPageRangeMax();
		if (stop > max) {
			stop = max;
		}

		return {
			'start': start,
			'stop': stop
		};
	},

	getPageNumTarget: function() {
		return this.pageNumTarget;
	},
	setPageNumTarget: function(pageNumTarget) {
		this.pageNumTarget = pageNumTarget;
	},
	// getters/setters - begin

	// methods - begin
	prefetch: function(pageNum) {
		this.onPrefetch(pageNum);
	},

	startPrefetch: function(pageNumTarget) {
		this.setPageNumTarget(pageNumTarget);

		var prefetchRangeResult = this.buildPrefetchRange(pageNumTarget);
		var start = prefetchRangeResult.start;
		var stop = prefetchRangeResult.stop;
		this.prefetchList.clear();

		for (var pageNum=start; pageNum<stop; pageNum++) {
			this.prefetchList.push(pageNum);
		}

		if (this.prefetchTimer === null) {
			this.prefetchTimer = new PeriodicalExecuter(function(pe) {
				while (this.prefetchList.length > 0) {
					var pageNum = this.prefetchList.shift();
					if (pageNum) {
						if (! this.isItemCached(pageNum)) {
							this.prefetch(pageNum);

							break;
						}
					} else {
						this.prefetchTimer = null;
						pe.stop();
					}
				}
			}.bindAsEventListener(this), this.prefetchInterval);
		}
	}
	// methods - end
});


// utility method checks to see if the element we're looking for exists, if not creates it and return
function elementCheckCreate() {
		var container = (arguments[0]) ? $(arguments[0]) : false;
		var tagname = (arguments[1]) ? arguments[1] : false;
		var elementParams = (arguments[2]) ? arguments[2] : {};

		if (! (container && tagname) ) {
			return false;
		}

		if (container.down(tagname)) {
			return container.down(tagname);
		}
		var newElement = new Element(tagname, elementParams);
		container.insert(newElement);
		return newElement;
}

/* function to bind to country field to update this state/province field */
function updateProvince(province, country, required) {
	var provinceField = $(province);
	var countryField = $(country);

	var provinceLabel = 'State/Province';
	var provinceList = null;
	switch ($F(countryField)) {
		case 'US':
			provinceLabel = 'State';
			provinceList = PageScope.getKey('us_stateList');
			break;
		case 'CA':
			provinceLabel = 'Province';
			provinceList = PageScope.getKey('ca_provinceList');
			break;
	}

	var provinceElement = null;
	if (provinceList) {
		/* replace the field with a new field
		assign the new field with the correct event handlers
		using Class method to get around Opera bug */
		provinceElement = Element.replace(provinceField, createHashSelect({'values': provinceList, 'name': provinceField.name, 'required': required}));
	} else {
		provinceField.replace('<input type="text" name="' + provinceField.name + '" id="' + provinceField.name + '" maxlength="32">');
		provinceElement = $(provinceField.name);
	}
	// tabindex
	var tabindex = provinceField.tabIndex;
	if (tabindex) {
		provinceElement.writeAttribute('tabindex', tabindex);
	}
	// tooltip
	var tooltip = provinceField.title;
	if (tooltip) {
		provinceElement.writeAttribute('title', tooltip);
	}
	// observe
	provinceElement.observe('focus', highlightField).observe('blur', highlightField); //.observe('blur', verifyField); // open text field needs verification

	var label = $("label-" + province);
	if (label) {
		label.update(localize(provinceLabel));
		if (! required) {
			label.insert(' <span class="optional">' + localize('(Optional)') + '</span>');
		}
	}
}


/* create an HTML select with options from a prototype Hash object
params are in map format
values: name: id: */
function createHashSelect(input) {
	var values = input.values;
	var name = input.name;
	var id = (input.id) ? input.id : name;
	var mySelect = Element.extend(document.createElement('select'));
	mySelect.writeAttribute({"name": name, "id": id, 'tabindex': input.tabindex});
	values.each(function(pair) {
		mySelect.insert({'bottom': '<option value="'+pair.key+'">'+pair.value+'</option>'});
	});
	if (mySelect.length > 0) {
		mySelect.selectedIndex = 0;
	}
	return mySelect;
}

function enableToggle() {
	$$('h4.toggle').each(function(header) {
		header.observe("click", function(e) {
			var toggleEl = Event.element(e).next('div');
			if (toggleEl) {
				Effect.toggle(toggleEl, 'blind');
			}
		});
	});
}

function enableFieldHighlight() {
	var myInputs = $$("input, textarea, select");
	setFocusFlag(myInputs);
	myInputs.invoke("observe","focus", setFocus);
	myInputs.invoke("observe","blur", setFocus);
	myInputs.invoke("observe","focus", highlightField);
	myInputs.invoke("observe","blur", highlightField);
	myInputs.each( function(input) {
		var myForm = input.up("form");
		if ( (input.type !== 'hidden') && !input.hasClassName('revertNo') && myForm && !myForm.hasClassName("revertNo")) {
			input.observe('change', UCPForm.fieldChanged);
		}
	});
}



/* handle timeout of session with AJAX call */
function handleTimeout(rj) {
	if (rj.error_is_fatal) {
		// if redirectURL is not current url to prevent redirect loop
		if ( (rj.redirect_url) && (window.location.href != rj.redirect_url) ) {
			window.location.href = rj.redirect_url;
		} else {
			// TODO: May not be the best solution right now
			window.error(localize('There was a fatal Error. Please try again'));
		}
	}
}


function populate_tech_contact_fields(instance_id, tech_contact_fields_array) {
	AjaxFetch.loadFormNoEvent("set-tech-contact", "/json/reseller/" + instance_id +"/get_tech_contact", {
		'onOkStart': function(cfg, rj) {
			var contact_data = $H(rj);

			tech_contact_fields_array.each( function(field_name) {
				var fieldValue = contact_data.get(field_name);
				UCPForm.setFieldValue('tech-' + field_name, fieldValue, true);
				if (field_name.indexOf("country") >= 0) {
					updateProvince("tech-state", "tech-country", false);
				}
			});
		}
	});
}

/* // dead code?
// utility function to set the value of a radio group
setRadio = function(radioGroup, value) {
	for (var i = 0, length = radioGroup.length; i < length; ++i) {
		if (radioGroup[i].value == value) {
			Element.writeAttribute(radioGroup[i], "checked", "true");
		}
	}
}
*/

// utility function for drop downs with an "other" type and then a field to enter other
//select = the select field to monitor
//other = the field to search for the value of other must be 'other'
selectOther = function(select, other) {
	var mySelect = $(select);
	var otherField = $(other);
	mySelect.observe("change", function(e) {
		if ($F(mySelect) == 'other') {
			otherField.show();
		} else {
			otherField.hide();
		}
	});
};

/* dead code?
// comparing two arrays
Array.prototype.compare = function(testArr) {
	if (this.length != testArr.length) return false;
	for (var i = 0; i < testArr.length; i++) {
		if (this[i].compare) {
			if (!this[i].compare(testArr[i])) return false;
		}
		if (this[i] !== testArr[i]) return false;
	}
	return true;
}
*/

// used to detect if domain nameserver list is default nameserver list. list item order is not important
function isListContained(defaultList, customList, isListLengthEqual) {
	defaultList = $(defaultList);
	customList = $(customList);

	if (isListLengthEqual) {
		if (defaultList.size() !== customList.size()) {
			return false;
		}
	}

	var contatins = false;

	contatins = customList.all( function(customItem) {
		var matchFound = defaultList.any( function(defaultItem) {
			return (customItem === defaultItem);
		});

		return matchFound;
	});

	return contatins;
}

/* function to update values in a select box
select: pass in select object or id
data: hash {value, text} */
updateSelect = function(select, data) {
	select = $(select);
	var keys = data.keys();
	var extraCount = (select.options.length > data.size())? select.options.length : data.size();
	for( var i = extraCount - 1; i >= 0; i-- ) {
		if (i < data.size()) {
			select.options[i] = new Option(data.get(keys[i]), keys[i]);
		} else {
			select.options[i] = null;
		}
	}
	select.selectedIndex = 0;
};

/* Domains */

function updateHistory(items, container) {
	var myItems = $A(items).reverse();
	var htmlHistory = container.update();
	myItems.each( function(item) {
		var myItem = $H(item);

		var htmlDate = new Element('div', {'class': 'date'}).update(myItem.get('date'));

		var note = myItem.get('note') || myItem.get('text');	// trust uses 'note', domain uses 'text'
		var htmlNote = new Element('div', {'class': 'desc'}).update(note.stripTags());

		var historyLine = new Element('div', {'class': 'historyLine'}).update(htmlDate).insert(htmlNote);

		htmlHistory.insert(historyLine);
	});
	return htmlHistory;
}

var UCPContact = {
	// checks if the currentContactType matches any of the contact types in contactTypeArray for the specified contact fields in contactFieldIdArray
	// contactTypeArray - string array of contact types to compare against
	// contactFieldIdArray - string array of contact fields to compare against for each contact type
	// currentContactType - the contact type to match with
	// return - the contact type that matches the currentContactType
	compareContactInfo: function(contactTypeArray, contactFieldIdArray, currentContactType) {
		var matchingContactType = '';

		contactTypeArray.any( function(contactType) {
			var matches = false;

			if (contactType !== currentContactType) {
				matches = contactFieldIdArray.all( function(fieldId) {
					var field1 = $F(currentContactType + '-' + fieldId);
					var field2 = $F(contactType + '-' + fieldId);
					return (field1 === field2);
				}, this);

				if (matches === true) {
					matchingContactType = contactType;
				}
			}

			return matches;
		}, this);

		return matchingContactType;
	},

	// loads contactInfo into contact info form
	// myForm - (not used anymore)
	// allowedContactTypes - string array of contact types
	// allowedContactFields - string array of contact fields
	// contactInfoList - contact info data structure
	loadContactInfo: function(allowedContactTypes, allowedContactFields, contactInfoList) {
		allowedContactTypes.each( function(contactType) {
			var contactInfo = $H(contactInfoList.get(contactType));
			allowedContactFields.each( function(fieldId) {
				var contactFieldValue = contactInfo.get(fieldId);
				if (contactFieldValue !== null) {
					UCPForm.setFieldValue(contactType + '-' + fieldId, contactFieldValue, true);
					if (fieldId.indexOf("country") >= 0) {
						updateProvince(contactType + "-state", contactType + "-" + fieldId, true);
					}
				}
			});
		});

		UCPContact.hideSameAsContacts(allowedContactTypes, allowedContactFields);
	},

	// hide contact info that are the same as other contact types
	// contactTypes - string array of contact types
	// contactFields - string array of contact fields
	hideSameAsContacts: function(contactTypes, contactFields) {
		contactTypes.each( function(contactType) {
			if (contactType !== contactTypes[0]) {
				var matchingContactType = UCPContact.compareContactInfo(contactTypes, contactFields, contactType);
				if (matchingContactType) {
					UCPForm.setFieldValue(contactType + '-' + 'same_as_select', matchingContactType, true);
					UCPContact.showContactInfo(contactType, false);
				}
			}
		});
	},

	// contact same-as select handler
	// e - event object
	contactSameAs: function(e) {
		var mySelect = e.findElement();
		var myContact = mySelect.name.split("-")[0];
		var myValue = $F(mySelect);
		UCPContact.showContactInfo(myContact, (myContact == myValue));
	},

	// show/hide the contact info for the specified contact type
	// contactType - contact type to show/hide contact info for
	// isShow - if the contact info should be shown or hidden
	showContactInfo: function(contactType, isShow) {
		var myClass = ".contact-" + contactType;
		if (isShow) {
			$$(myClass).invoke("setStyle", "visibility: visible;");
		} else {
			$$(myClass).invoke("setStyle", "visibility: hidden;");
		}
	}
};


/* // dead code?
setDefaultNS = function() {
	setNameServers('set-nameservers-form', 'nameservers', defaultNameServers);
}
*/

// history/notes
function showHistory() {
	var getHistoryURL = PageScope.getKey('getHistoryURL', '');
	if (getHistoryURL) {
		var historyContainer = $("history");
		if (historyContainer) {
			AjaxFetch.loadContainerNoEvent(historyContainer, getHistoryURL, {
				'onOkStart': function(cfg, rj) {
					var myContainer = cfg.getContainer();
					updateHistory(rj.items, myContainer);
				}
			});
		}
	}
}

/* send password to user */
sendPassword = function(contactType) {
	AjaxFetch.processFormNoEvent("send-password", {
		'onSubmitBefore': function(cfg) {
			var myForm = cfg.getForm();
			myForm.send_password_contact_type.value = contactType;
		},
		'onOkStart': function(cfg, rj) {
			showHistory();
		}
	});
};


/* END Domains */

/* Customer Messaging */

getDefaults = function(ajaxPath, messageid) {
	AjaxFetch.loadFormNoEvent("message-form", ajaxPath, {
		'parameters': { 'message_id': messageid },
		'onOkStart': function(cfg, rj) {
			$H(rj.info).each( function(param) {
				if ( (param.value.read_only == 0) && ($(param.key)) ) {
					$(param.key).setValue(param.value.text || param.value.address);
				}
			});

			var myForm = cfg.getForm();
			var myBodies = myForm.getElementsBySelector("textarea[name='body']");
			var defaultBodies = $A(rj.info.body);
			for (var i=0; i<defaultBodies.size(); i++) {
				if (defaultBodies[i].readonly == 0) {
					myBodies[i].value = defaultBodies[i].text;
				}
			}
		}
	});
};

/* END Customer Messaging */