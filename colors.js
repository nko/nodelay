// ported from Pircbot, jibble.org
// Copyright Paul James Mutton
// released under GPL

function removeColors(line) {
    var length = line.length,
        buffer = "",
        i = 0;
    while (i < length) {
        var ch = line.charAt(i);
        if (ch == '\u0003') {
            i++;
            // Skip "x" or "xy" (foreground color).
            if (i < length) {
                ch = line.charAt(i);
                if (/\d/.test(ch)) {
                    i++;
                    if (i < length) {
                        ch = line.charAt(i);
                        if (/\d/.test(ch)) {
                            i++;
                        }
                    }
                    // Now skip ",x" or ",xy" (background color).
                    if (i < length) {
                        ch = line.charAt(i);
                        if (ch == ',') {
                            i++;
                            if (i < length) {
                                ch = line.charAt(i);
                                if (/\d/.test(ch)) {
                                    i++;
                                    if (i < length) {
                                        ch = line.charAt(i);
                                        if (/\d/.test(ch)) {
                                            i++;
                                        }
                                    }
                                }
                                else {
                                    // Keep the comma.
                                    i--;
                                }
                            }
                            else {
                                // Keep the comma.
                                i--;
                            }
                        }
                    }
                }
            }
        }
        else if (ch == '\u000f') {
            i++;
        }
        else {
            buffer += ch;
            i++;
        }
    }
    return buffer;
}
    
function removeFormatting(line) {
    var length = line.length,
        buffer = "";
    for (var i = 0; i < length; i++) {
        var ch = line.charAt(i);
        if (ch == '\u000f' || ch == '\u0002' || ch == '\u001f' || ch == '\u0016') {
            // Don't add this character.
        }
        else {
            buffer += ch;
        }
    }
    return buffer;
}
    
function removeFormattingAndColors(line) {
    return removeFormatting(removeColors(line));
}

exports.removeFormattingAndColors = removeFormattingAndColors;