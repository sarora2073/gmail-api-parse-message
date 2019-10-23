let b64Decode = require('base-64').decode;
let addressparser = require('addressparser');

/**
 * Decodes a url safe Base64 string to its original representation.
 * @param  {string} string
 * @return {string}
 */
function urlB64Decode(string) {
  return string
   ? decodeURIComponent(escape(b64Decode(string.replace(/\-/g, '+').replace(/\_/g, '/'))))
   : '';
}

/**
 * Takes the header array filled with objects and transforms it into a more
 * pleasant key-value object.
 * @param  {array} headers
 * @return {object}
 */
function indexHeaders(headers) {
  if (!headers) {
    return {};
  } else {
    return headers.reduce(function (result, header) {
      result[header.name.toLowerCase()] = header.value;
      return result;
    }, {});
  }
}

/**
 * Transforms the header email address into an object containing the name and email address
 * @param  {array} headers
 * @return {name: '', address: ''}
 */
function parseAddresses(headers) {
  if (!headers) {
    return {};
  } else if (!headers.from) {
    return headers;
  } else {
    // console.log('headers', headers);
    // console.log('headers.from', headers.from);       
    let parsedFrom = addressparser(headers.from)[0];
    headers.from = {
      name: parsedFrom.hasOwnProperty('name') ? parsedFrom.name : '',
      address: parsedFrom.address.toLowerCase()
    };
    if (headers.from.name === '' || headers.from.name === ' ') {
      headers.from.name = headers.from.address.toLowerCase();
    }

    headers.to = addressparser(headers.to);
    for (let u = 0; u < headers.to.length; u++) {
      headers.to[u].address = headers.to[u].address ? headers.to[u].address.toLowerCase() : null;
    }

    headers.cc = addressparser(headers.cc);
    for (let w = 0; w < headers.cc.length; w++) {
      headers.cc[w].address = headers.cc[w].address ? headers.cc[w].address.toLowerCase() : null;
    }

    headers.bcc = addressparser(headers.bcc);
    for (let w = 0; w < headers.bcc.length; w++) {
      headers.bcc[w].address = headers.bcc[w].address ? headers.bcc[w].address.toLowerCase() : null;
    }

    return headers;
  }
}


/**
 * Takes a response from the Gmail API's GET message method and extracts all
 * the relevant data.
 * @param  {object} response
 * @return {object}
 */
module.exports = function parseMessage(response) {
  let result = {
    id: response.id,
    threadId: response.threadId,
    labelIds: response.labelIds,
    snippet: response.snippet,
    historyId: response.historyId
  };
  if (response.internalDate) {
    result.internalDate = parseInt(response.internalDate);
  }

  let payload = response.payload;
  if (!payload) {
    return result;
  }

  let headers = indexHeaders(payload.headers);
  let parsedHeaders = parseAddresses(headers);
  result.headers = parsedHeaders;

  let parts = [payload];
  let firstPartProcessed = false;

  while (parts.length !== 0) {
    let part = parts.shift();
    if (part.parts) {
      parts = parts.concat(part.parts);
    }
    if (firstPartProcessed) {
      headers = indexHeaders(part.headers);
    }

    if (!part.body) {
      continue;
    }

    let isHtml = part.mimeType && part.mimeType.indexOf('text/html') !== -1;
    let isPlain = part.mimeType && part.mimeType.indexOf('text/plain') !== -1;
    let isAttachment = headers['content-disposition'] && headers['content-disposition'].indexOf('attachment') !== -1;
    let isInline = headers['content-disposition'] && headers['content-disposition'].indexOf('inline') !== -1;

    if (isHtml && !isAttachment) {
      result.textHtml = urlB64Decode(part.body.data);
    } else if (isPlain && !isAttachment) {
      result.textPlain = urlB64Decode(part.body.data);
    } else if (isAttachment) {
      let body = part.body;
      if(!result.attachments) {
        result.attachments = [];
      }
      result.attachments.push({
        filename: part.filename,
        mimeType: part.mimeType,
        size: body.size,
        attachmentId: body.attachmentId,
        headers: indexHeaders(part.headers)
      });
    } else if (isInline) {
    let body = part.body;
    if(!result.inline) {
      result.inline = [];
    }
    result.inline.push({
      filename: part.filename,
      mimeType: part.mimeType,
      size: body.size,
      attachmentId: body.attachmentId,
      headers: indexHeaders(part.headers)
    });
  }

    firstPartProcessed = true;
  }

  return result;
};
