'use strict';

function selectWindowsStoreCertificate(certificates){
  return Array.isArray(certificates)&&certificates.length>0?certificates[0]:undefined;
}

module.exports={selectWindowsStoreCertificate};