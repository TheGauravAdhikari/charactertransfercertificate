"use strict";

const workbookInput = document.getElementById("workbook-input");
const photosInput = document.getElementById("photos-input");
const logoInput = document.getElementById("logo-input");
const schoolInput = document.getElementById("school-input");
const searchInput = document.getElementById("search-input");
const studentList = document.getElementById("student-list");
const statusMessage = document.getElementById("status-message");
const printButton = document.getElementById("print-button");
const templatePicker = document.querySelector(".template-picker");
const rangeStart = document.getElementById("range-start");
const rangeEnd = document.getElementById("range-end");
const selectRangeButton = document.getElementById("select-range-button");
const clearSelectionButton = document.getElementById("clear-selection-button");
const printBatch = document.getElementById("print-batch");
const objectUrls = new Set();
const photoUrls = new WeakMap();

let students = [];
let selectedIndex = -1;
const selectedStudents = new Set();
let photoFiles = [];
let schoolInfo = {};
let logoUrl = "";

const namePattern = /full.?name|(^|[\s_-])(student\s*)?name($|[\s_-])/i;

function showStatus(message, kind = "") {
  statusMessage.textContent = message;
  statusMessage.dataset.kind = kind;
}

function studentSerial(student, index) {
  return firstMatchingField(student, /^(?:sn|s\.?\s*n\.?|serial(?:\s*(?:no|number))?)$/i) || String(index + 1);
}

function studentRangeNumber(student, index) {
  const digits = studentSerial(student, index).match(/\d+/);
  const parsed = digits ? Number.parseInt(digits[0], 10) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : index + 1;
}

function cleanText(value) {
  if (value === null || value === undefined) return "";
  if (value instanceof Date && !Number.isNaN(value.valueOf())) {
    return value.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
  }
  return String(value).trim();
}

function certificateDate(value) {
  if (value instanceof Date && !Number.isNaN(value.valueOf())) {
    return `${value.getMonth() + 1}/${value.getDate()}/${value.getFullYear()}`;
  }
  const text = cleanText(value);
  const match = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2}|\d{4})$/);
  return match ? `${Number(match[1])}/${Number(match[2])}/${match[3]}` : text;
}

function dateValueFor(student, patterns, fallback = "") {
  const entry = Object.entries(student).find(([key, value]) =>
    patterns.some(pattern => pattern.test(key)) && cleanText(value)
  );
  return entry ? certificateDate(entry[1]) : fallback;
}

function schoolFontSizeSetting(value, label, minPx, maxPx) {
  if (!value) return null;
  const match = value.match(/^(\d+(?:\.\d+)?)\s*(px|pt)?$/i);
  if (!match) throw new Error(`${label} must be a size in px or pt.`);

  const size = Number(match[1]);
  const unit = (match[2] || "px").toLocaleLowerCase();
  const pixels = unit === "pt" ? size * 4 / 3 : size;
  if (pixels < minPx || pixels > maxPx) {
    throw new Error(`${label} must be between ${minPx}px and ${maxPx}px.`);
  }

  const printSize = unit === "pt" ? size : size * 0.75;
  return {
    screen: `${size}${unit}`,
    print: `${Number(printSize.toFixed(2))}pt`
  };
}

function firstMatchingField(student, pattern) {
  const entry = Object.entries(student).find(([key, value]) => pattern.test(key) && cleanText(value));
  return entry ? cleanText(entry[1]) : "";
}

function studentName(student) {
  return firstMatchingField(student, namePattern) ||
    firstMatchingField(student, /student|candidate/i) ||
    Object.values(student).map(cleanText).find(Boolean) ||
    "Unnamed student";
}

function valueFor(student, patterns, fallback) {
  for (const pattern of patterns) {
    const value = firstMatchingField(student, pattern);
    if (value) return value;
  }
  return fallback;
}

function genderKind(value) {
  const gender = cleanText(value).toLocaleLowerCase();
  if (/^(female|f|woman|girl)$/.test(gender)) return "female";
  if (/^(male|m|man|boy)$/.test(gender)) return "male";
  return "";
}

function stripHonorific(value) {
  return cleanText(value).replace(/^(mr\.?|mrs\.?|miss|ms\.?)\s+/i, "");
}

function studentGender(student) {
  return genderKind(valueFor(
    student,
    [/student.?gender|gender.?of.?student/i, /^(gender|sex)$/i, /^(?!.*(?:parent|father|mother|guardian)).*(gender|sex)/i],
    ""
  ));
}

function certificatePronouns(student) {
  const gender = student ? studentGender(student) : "";
  if (gender === "female") {
    return { title: "Ms.", child: "daughter", heShe: "She", hisHer: "her", himHer: "her" };
  }
  if (gender === "male") {
    return { title: "Mr.", child: "son", heShe: "He", hisHer: "his", himHer: "him" };
  }
  return {
    title: "Mr. / Ms.",
    child: "son / daughter",
    heShe: "He / She",
    hisHer: "his / her",
    himHer: "him / her"
  };
}

function parentNames(student) {
  if (!student) return { father: "", mother: "" };
  const father = stripHonorific(valueFor(student, [/^father|father.?name|name.?of.?father/i], ""));
  const mother = stripHonorific(valueFor(student, [/^mother|mother.?name|name.?of.?mother/i], ""));
  const parent = stripHonorific(valueFor(student, [/parent|guardian/i], ""));
  return {
    father: father || parent,
    mother
  };
}

function blankSpan(value) {
  return { fill: true, value: cleanText(value) };
}

function certificateParts(student, template) {
  const pronouns = certificatePronouns(student);
  const parents = parentNames(student);
  const examYear = student
    ? valueFor(student, [
        /^examheldyearbs$/i,
        /exam(?:ination)?\s*year|held in|passing year|passed year|academic year/i
      ], "")
    : "";
  const examYearBs = student
    ? valueFor(student, [/^examheldyearbs$/i, /exam(?:ination)?.*b\.?s|held in.*b\.?s|year.*b\.?s/i], examYear)
    : "";
  const examYearAd = student
    ? valueFor(student, [/^examheldyearad$/i, /exam(?:ination)?.*a\.?d|held in.*a\.?d|year.*a\.?d/i], "")
    : "";
  const classFromYear = student ? valueFor(student, [/^yearclassfrombs$/i], "") : "";
  const classToYear = student ? valueFor(student, [/^yearclasstobs$/i], "") : "";
  const namedExam = student ? valueFor(student, [/examination|exam\b/i], "") : "";
  const className = student
    ? valueFor(student, [/class|grade|level/i], template === "neb" ? "12" : "").replace(/^(class|grade)\s+/i, "")
    : "";
  const examination = ((student ? valueFor(student, [/^lastclass$/i], "") : "")
    || namedExam
    || (template === "neb" ? "Grade 12 / NEB" : className ? `Class ${className}` : ""))
    .replace(/\s+examination$/i, "");
  const result = student ? valueFor(student, [/gpa|grade point/i], "") : "";
  const birthDateBs = student
    ? dateValueFor(student, [/^dateofbirthbs$/i, /(?:date.?of.?birth|dob|birth).*b\.?s/i],
      dateValueFor(student, [/^(?:date.?of.?birth|dob)$/i]))
    : "";
  const birthDateAd = student
    ? dateValueFor(student, [/^dateofbirthad$/i, /(?:date.?of.?birth|dob|birth).*a\.?d/i])
    : "";
  const province = student ? valueFor(student, [/province/i], "") : "";
  const district = student ? valueFor(student, [/district/i], "") : "";
  const municipality = student ? valueFor(student, [/municipality|rural\s*municipality/i], "") : "";
  const ward = student ? valueFor(student, [/ward(?:\s*(?:no|number))?/i], "") : "";
  const address = student
    ? valueFor(student, [/permanent.?address|residential.?address|full.?address|address/i], [
        province,
        district,
        municipality,
        ward && `Ward ${ward}`
      ].filter(Boolean).join(", "))
    : "";
  const choice = value => (student ? blankSpan(value) : value);

  return [
    "This is to certify that ",
    choice(pronouns.title),
    " ",
    blankSpan(student ? studentName(student) : ""),
    ", ",
    choice(pronouns.child),
    " of Mr. ",
    blankSpan(parents.father),
    " and Mrs. ",
    blankSpan(parents.mother),
    ", a permanent resident of ",
    blankSpan(address),
    ", was a bonafide student of this institution. ",
    choice(pronouns.heShe),
    " studied from ",
    blankSpan(classFromYear),
    " B.S. to ",
    blankSpan(classToYear),
    " B.S. ",
    choice(pronouns.heShe),
    " has passed the ",
    blankSpan(examination),
    " Examination held in the year ",
    blankSpan(examYearBs),
    " B.S. (",
    blankSpan(examYearAd),
    " A.D.) and secured a Cumulative Grade Point Average (GPA) of ",
    blankSpan(result),
    ".",
    { paragraphBreak: true },
    "According to the school records, ",
    choice(pronouns.hisHer),
    " date of birth is ",
    blankSpan(birthDateBs),
    " B.S. (",
    blankSpan(birthDateAd),
    " A.D.).",
    { paragraphBreak: true },
    choice(pronouns.heShe),
    " bears a ",
    { bold: "good" },
    " moral character and we wish ",
    choice(pronouns.himHer),
    " every success in future academic career and life."
  ];
}

function renderCertificateBody(container, parts) {
  let paragraph = document.createElement("p");
  const paragraphs = [paragraph];
  for (const part of parts) {
    if (typeof part === "string") {
      paragraph.append(document.createTextNode(part));
      continue;
    }
    if (part.paragraphBreak) {
      paragraph = document.createElement("p");
      paragraphs.push(paragraph);
      continue;
    }
    if (part.bold) {
      const strong = document.createElement("strong");
      strong.textContent = part.bold;
      paragraph.append(strong);
      continue;
    }
    const blank = document.createElement("span");
    blank.className = part.value ? "cert-value" : "cert-placeholder";
    blank.textContent = part.value || "………………";
    paragraph.append(blank);
  }
  container.replaceChildren(...paragraphs);
}

function studentSubtitle(student) {
  const roll = firstMatchingField(student, /roll|reg(?:istration)?[\s._-]*no\b|admission|symbol|id\b/i);
  const className = firstMatchingField(student, /class|grade|level|section/i);
  return [roll && `No. ${roll}`, className && `Class ${className}`].filter(Boolean).join(" · ") || "Student record";
}

function normalizeSearch(value) {
  return cleanText(value).normalize("NFKC").toLocaleLowerCase().replace(/[\s\p{P}\p{S}]+/gu, "");
}

function normalized(value) {
  return cleanText(value).toLocaleLowerCase().replace(/\.[^.]+$/, "").replace(/[^a-z0-9]/g, "");
}

function photoFor(student) {
  const identifiers = Object.entries(student)
    .filter(([key, value]) => /name|roll|reg(?:istration)?[\s._-]*no\b|admission|symbol|student.?id/i.test(key) && cleanText(value))
    .map(([, value]) => normalized(value))
    .filter(value => value.length > 1);
  if (!identifiers.length) return null;

  let best = null;
  let bestScore = 0;
  for (const file of photoFiles) {
    const fileKey = normalized(file.name);
    const match = identifiers.find(identifier => fileKey === identifier || fileKey.startsWith(identifier) || identifier.startsWith(fileKey));
    if (match) {
      const score = fileKey === match ? 2 : 1;
      if (score > bestScore) {
        best = file;
        bestScore = score;
      }
    }
  }
  return best;
}

function makeObjectUrl(file) {
  if (file.url) return file.url;
  const cachedUrl = photoUrls.get(file);
  if (cachedUrl) return cachedUrl;
  const url = URL.createObjectURL(file);
  objectUrls.add(url);
  photoUrls.set(file, url);
  return url;
}

function initials(name) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join("").toLocaleUpperCase() || "?";
}

function studentRow(student, index) {
  const row = document.createElement("div");
  row.className = "student-row";
  row.setAttribute("aria-selected", String(index === selectedIndex));
  row.tabIndex = 0;

  const serial = document.createElement("span");
  serial.className = "row-serial";
  serial.textContent = studentSerial(student, index);

  const avatar = document.createElement("span");
  avatar.className = "student-avatar";
  const photo = photoFor(student);
  if (photo) {
    const image = document.createElement("img");
    image.alt = "";
    image.src = makeObjectUrl(photo);
    avatar.append(image);
  } else {
    avatar.textContent = initials(studentName(student));
  }

  const info = document.createElement("span");
  info.className = "student-info";
  const name = document.createElement("span");
  name.className = "student-name";
  name.textContent = studentName(student);
  const subtitle = document.createElement("span");
  subtitle.className = "student-subtitle";
  subtitle.textContent = studentSubtitle(student);
  info.append(name, subtitle);

  const check = document.createElement("input");
  check.type = "checkbox";
  check.className = "row-check";
  check.checked = selectedStudents.has(index);
  check.setAttribute("aria-label", `Select SN ${studentSerial(student, index)}, ${studentName(student)}`);
  check.addEventListener("click", event => event.stopPropagation());
  check.addEventListener("change", () => toggleStudent(index, check.checked));

  row.append(serial, avatar, info, check);
  row.addEventListener("click", () => selectStudent(index));
  row.addEventListener("keydown", event => {
    if (event.target === row && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      selectStudent(index);
    }
  });
  return row;
}

function updateSelectionControls() {
  printButton.disabled = selectedStudents.size === 0;
  printButton.innerHTML = `<span aria-hidden="true">↗</span> Print selected (${selectedStudents.size})`;
  clearSelectionButton.disabled = selectedStudents.size === 0;
}

function toggleStudent(index, checked) {
  if (checked) selectedStudents.add(index);
  else selectedStudents.delete(index);
  updateSelectionControls();
}

function selectStudentRange() {
  const start = Number.parseInt(rangeStart.value, 10);
  const end = Number.parseInt(rangeEnd.value, 10);
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start) {
    showStatus("Enter a valid SN range. The starting number must be 1 or higher and no greater than the ending number.", "error");
    return;
  }

  const matched = [];
  students.forEach((student, index) => {
    const serial = studentRangeNumber(student, index);
    if (serial >= start && serial <= end) {
      selectedStudents.add(index);
      matched.push(serial);
    }
  });
  if (!matched.length) {
    showStatus(`No student SN values found from ${start} to ${end}.`, "error");
    return;
  }
  updateSelectionControls();
  renderList();
  showStatus(`Selected ${matched.length} student${matched.length === 1 ? "" : "s"} in SN range ${start}–${end}.`, "success");
}

function renderList() {
  const query = normalizeSearch(searchInput.value);
  const matches = students
    .map((student, index) => ({ student, index }))
    .filter(({ student }) => !query || Object.entries(student).some(([field, value]) =>
      normalizeSearch(`${field} ${cleanText(value)}`).includes(query)
    ));

  studentList.replaceChildren();
  document.querySelector(".student-list-heading").hidden = students.length === 0;
  if (!students.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.innerHTML = '<span class="empty-icon" aria-hidden="true">▦</span><strong>Your student list will appear here</strong><span>Student records load automatically when the app starts.</span>';
    studentList.append(empty);
    return;
  }
  if (!matches.length) {
    const empty = document.createElement("p");
    empty.className = "no-results";
    empty.textContent = "No students match your search.";
    studentList.append(empty);
    return;
  }
  const fragment = document.createDocumentFragment();
  for (const { student, index } of matches) fragment.append(studentRow(student, index));
  studentList.append(fragment);
}

function setSchoolHeading() {
  const name = schoolInfo["school name"] || schoolInfo["college name"] || schoolInfo["institution"] || "School / College Name";
  const shortName = schoolInfo["short name"] || "";
  const address = schoolInfo.address || "";
  const nameFontSize = schoolFontSizeSetting(
    schoolInfo["school name font size"], "School Name Font Size", 8, 36
  );
  const detailsFontSize = schoolFontSizeSetting(
    schoolInfo["school details font size"], "School Details Font Size", 5, 24
  );
  const established = schoolInfo["est date"] || schoolInfo["est. date"] ||
    schoolInfo["established date"] || schoolInfo["establishment date"] ||
    schoolInfo["date established"] || schoolInfo["year established"] || "";
  const heading = document.querySelector(".school-heading");
  for (const [screenProperty, printProperty, setting] of [
    ["--school-name-font-size", "--school-name-print-font-size", nameFontSize],
    ["--school-details-font-size", "--school-details-print-font-size", detailsFontSize]
  ]) {
    if (setting) {
      heading.style.setProperty(screenProperty, setting.screen);
      heading.style.setProperty(printProperty, setting.print);
    } else {
      heading.style.removeProperty(screenProperty);
      heading.style.removeProperty(printProperty);
    }
  }
  document.getElementById("certificate-school-name").textContent = shortName || name;
  const schoolCode = schoolInfo["school code"] || schoolInfo.schoolcode || "";
  const schoolCodeElement = document.getElementById("certificate-school-code");
  schoolCodeElement.textContent = schoolCode ? `School Code: ${schoolCode}` : "";
  schoolCodeElement.hidden = !schoolCode;
  const fullNameElement = document.getElementById("certificate-school-fullname");
  fullNameElement.textContent = shortName ? name : "";
  fullNameElement.hidden = !shortName;
  document.getElementById("certificate-school-address").textContent = address || "Add your school details to get started";
  const establishedElement = document.getElementById("certificate-school-established");
  establishedElement.textContent = established ? `Estd: ${established}` : "";
  establishedElement.hidden = !established;
  const tagline = (schoolInfo.tagline || schoolInfo.motto || schoolInfo.slogan || "").replace(/^["“”']+|["“”']+$/g, "");
  const taglineElement = document.getElementById("certificate-school-tagline");
  taglineElement.textContent = tagline ? `“${tagline}”` : "";
  taglineElement.hidden = !tagline;
  const phone = schoolInfo.phone || schoolInfo.contact || "";
  const contactElement = document.getElementById("certificate-school-meta");
  contactElement.replaceChildren();
  if (phone) {
    const icon = document.createElement("span");
    icon.className = "phone-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = "☎";
    contactElement.append(icon, document.createTextNode(` ${phone}`));
  }
  contactElement.hidden = !phone;
  const principal = schoolInfo.principal || schoolInfo["principal name"] || "";
  document.getElementById("certificate-principal").textContent = principal;
  document.querySelectorAll(".watermark-pattern").forEach(pattern => {
    const fragment = document.createDocumentFragment();
    for (let index = 0; index < 80; index += 1) {
      const label = document.createElement("span");
      label.textContent = name;
      fragment.append(label);
    }
    pattern.replaceChildren(fragment);
  });
}

function setCertificateLogo(source) {
  document.querySelectorAll(".certificate-logo, .watermark-logo").forEach(image => {
    image.src = source;
    image.hidden = false;
  });
}

function setPhoto(student, certificate = document) {
  const image = certificate.querySelector("#certificate-photo");
  const placeholder = certificate.querySelector("#photo-placeholder");
  const file = photoFor(student);
  if (!file) {
    image.hidden = true;
    image.removeAttribute("src");
    placeholder.hidden = false;
    return;
  }
  image.src = makeObjectUrl(file);
  image.hidden = false;
  placeholder.hidden = true;
}

function populateCertificate(certificate, student, template) {
  renderCertificateBody(certificate.querySelector("#certificate-body"), certificateParts(student, template));

  const reference = student
    ? firstMatchingField(student, /^ref(?:erence)?[\s._-]*(?:no|number)?\.?$/i)
    : "";
  const schoolReference = schoolInfo["ref no"] || schoolInfo["ref. no"] ||
    schoolInfo.refno || schoolInfo["reference no"] || "";
  certificate.querySelector("#certificate-reference").textContent =
    `Ref No.: ${reference || schoolReference || "…………"}`;

  const details = certificate.querySelector("#certificate-details");
  const registrationNo = student ? firstMatchingField(student, /^reg[\s._-]*no\.?$/i) : "";
  const registrationType = student ? firstMatchingField(student, /^reg[\s._-]*no[\s._-]*name$/i) : "";
  const registrationLabel = registrationType
    ? `${registrationType} Registration No`
    : "Registration No";
  const symbolNo = student ? firstMatchingField(student, /symbol[\s._-]*(?:no|number)?\b/i) : "";
  const entries = student
    ? [
      [registrationLabel, registrationNo],
      ["Symbol No", symbolNo],
      ["IEMIS ID", firstMatchingField(student, /iemis|emis/i)]
      ].filter(([, value]) => value)
    : [];
  if (!entries.length) {
    details.replaceChildren();
    details.hidden = true;
  } else {
    const fragment = document.createDocumentFragment();
    for (const [label, value] of entries) {
      const line = document.createElement("p");
      line.append(document.createTextNode(`${label}: `));
      const blank = document.createElement("span");
      blank.className = "cert-value";
      blank.textContent = value;
      line.append(blank);
      fragment.append(line);
    }
    details.replaceChildren(fragment);
    details.hidden = false;
  }

  certificate.querySelector("#certificate-date").textContent = "Date of Issue: November 9, 2026";
  if (student) setPhoto(student, certificate);
  else {
    const image = certificate.querySelector("#certificate-photo");
    const placeholder = certificate.querySelector("#photo-placeholder");
    image.hidden = true;
    image.removeAttribute("src");
    placeholder.hidden = false;
  }
}

function renderCertificate(student) {
  const template = templatePicker.querySelector('input[name="certificate-template"]:checked').value;
  populateCertificate(document.getElementById("certificate"), student, template);
  renderList();
}

function selectStudent(index) {
  selectedIndex = index;
  renderCertificate(students[index]);
}

function printSelectedStudents() {
  const indexes = Array.from(selectedStudents).sort((a, b) => a - b);
  if (!indexes.length) {
    showStatus("Tick one or more students before printing.", "error");
    return;
  }

  const template = templatePicker.querySelector('input[name="certificate-template"]:checked').value;
  const preview = document.getElementById("certificate");
  const fragment = document.createDocumentFragment();
  for (const index of indexes) {
    const certificate = preview.cloneNode(true);
    certificate.id = `print-certificate-${index + 1}`;
    certificate.classList.add("print-certificate");
    populateCertificate(certificate, students[index], template);
    fragment.append(certificate);
  }
  printBatch.replaceChildren(fragment);
  window.print();
}

function headerRowIndex(rows) {
  let bestIndex = 0;
  let bestScore = -1;
  const keywords = /full.?name|name|student|roll|reg.?no|symbol.?no|\bsn\b|class|grade|dob|birth|father|mother|gender|address|admission|registration|symbol|contact/i;
  for (let index = 0; index < Math.min(rows.length, 15); index += 1) {
    const row = rows[index] || [];
    const values = row.map(cleanText).filter(Boolean);
    const keywordCount = values.filter(value => keywords.test(value)).length;
    const score = keywordCount * 3 + Math.min(values.length, 8);
    if (values.length > 1 && score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  }
  return bestIndex;
}

function parseSheetRows(rows) {
  const start = headerRowIndex(rows);
  const headers = (rows[start] || []).map((value, index) => cleanText(value) || `Field ${index + 1}`);
  const seen = new Map();
  const uniqueHeaders = headers.map((header, index) => {
    const count = (seen.get(header) || 0) + 1;
    seen.set(header, count);
    return count > 1 ? `${header} ${count}` : header;
  });
  return rows.slice(start + 1).map(row => {
    const record = {};
    uniqueHeaders.forEach((header, index) => {
      const value = row[index];
      if (value !== null && value !== undefined && cleanText(value)) record[header] = value;
    });
    return record;
  }).filter(record => Object.keys(record).length > 0);
}

async function loadWorkbook(file) {
  if (!window.XLSX) {
    showStatus("The Excel reader did not load. Check your internet connection, refresh this page, and try again.", "error");
    return false;
  }
  try {
    showStatus("Reading spreadsheet…");
    const data = await file.arrayBuffer();
    const workbook = window.XLSX.read(data, { type: "array", cellDates: true });
    const firstSheet = workbook.SheetNames[0];
    if (!firstSheet) throw new Error("The workbook does not contain a worksheet.");
    const rows = window.XLSX.utils.sheet_to_json(workbook.Sheets[firstSheet], { header: 1, defval: "", raw: false });
    students = parseSheetRows(rows);
    selectedIndex = -1;
    document.getElementById("record-count").textContent = String(students.length);
    searchInput.disabled = false;
    selectRangeButton.disabled = false;
    selectedStudents.clear();
    updateSelectionControls();
    renderList();
    if (!students.length) {
      showStatus("No student rows were found. Check that the first worksheet has a header row and records.", "error");
      return false;
    }
    showStatus(`Loaded ${students.length} student record${students.length === 1 ? "" : "s"} from “${firstSheet}”. Select a student to preview their certificate.`, "success");
    return true;
  } catch (error) {
    showStatus(`Could not read the spreadsheet: ${error.message}`, "error");
    return false;
  }
}

function applySchoolRecord(text, filename) {
  const parsed = {};
  for (const line of text.split(/\r?\n/)) {
    const separator = line.indexOf(":");
    if (separator < 0) continue;
    const key = line.slice(0, separator).trim().toLocaleLowerCase();
    const value = line.slice(separator + 1).trim();
    if (key && value && !/^(null|none|n\/a|-)$/i.test(value)) parsed[key] = value;
  }
  schoolInfo = parsed;
  setSchoolHeading();
  document.getElementById("school-label").textContent = filename;
}

async function loadSchoolRecord(file) {
  try {
    applySchoolRecord(await file.text(), file.name);
    showStatus("School details loaded.", "success");
  } catch (error) {
    showStatus(`Could not read the school details file: ${error.message}`, "error");
  }
}

async function loadDefaultAssets() {
  if (location.protocol === "file:") {
    showStatus("To load your files automatically, start the app with start-app.bat.", "error");
    return;
  }

  try {
    const workbookResponse = await fetch("./Data.xlsx");
    if (!workbookResponse.ok) throw new Error("Data.xlsx was not found beside the app.");
    const workbookFile = new File([await workbookResponse.blob()], "Data.xlsx");
    const workbookLoaded = await loadWorkbook(workbookFile);

    const schoolResponse = await fetch("./school-record.txt");
    if (schoolResponse.ok) {
      applySchoolRecord(await schoolResponse.text(), "school-record.txt");
    }

    const logoResponse = await fetch("./logo.png");
    if (logoResponse.ok) {
      const logo = new File([await logoResponse.blob()], "logo.png", { type: "image/png" });
      logoUrl = makeObjectUrl(logo);
      setCertificateLogo(logoUrl);
      document.getElementById("logo-label").textContent = "logo.png";
    }

    const photosResponse = await fetch("/api/photos");
    if (!photosResponse.ok) throw new Error("Could not read the Photos folder.");
    const photos = await photosResponse.json();
    photoFiles = photos.map(name => ({
      name: name.split(/[\\/]/).pop(),
      url: `/api/photo?name=${encodeURIComponent(name)}`
    }));
    document.getElementById("photos-label").textContent = photoFiles.length
      ? `${photoFiles.length} photos loaded`
      : "No photos found in Photos folder";
    renderList();
    showStatus(
      workbookLoaded
        ? `Ready — ${students.length} students loaded. Tick a student to prepare their certificate.`
        : "The app opened, but the student spreadsheet could not be loaded. Check Data.xlsx.",
      workbookLoaded ? "success" : "error"
    );
  } catch (error) {
    showStatus(`Could not load school files automatically: ${error.message} Start the app using start-app.bat.`, "error");
  }
}

workbookInput.addEventListener("change", event => {
  const file = event.target.files && event.target.files[0];
  if (!file) return;
  document.getElementById("workbook-label").textContent = file.name;
  loadWorkbook(file);
});

photosInput.addEventListener("change", event => {
  photoFiles = Array.from(event.target.files || []).filter(file => file.type.startsWith("image/"));
  const label = document.getElementById("photos-label");
  label.textContent = photoFiles.length ? `${photoFiles.length} photo${photoFiles.length === 1 ? "" : "s"} selected` : "No images found in that folder";
  if (selectedIndex >= 0) renderCertificate(students[selectedIndex]);
  else renderList();
  if (photoFiles.length) showStatus(`Ready to match ${photoFiles.length} photo${photoFiles.length === 1 ? "" : "s"} by student name or ID.`, "success");
});

logoInput.addEventListener("change", event => {
  const file = event.target.files && event.target.files[0];
  if (!file) return;
  if (logoUrl) URL.revokeObjectURL(logoUrl);
  logoUrl = makeObjectUrl(file);
  setCertificateLogo(logoUrl);
  document.getElementById("logo-label").textContent = file.name;
});

schoolInput.addEventListener("change", event => {
  const file = event.target.files && event.target.files[0];
  if (file) loadSchoolRecord(file);
});

searchInput.addEventListener("input", renderList);
selectRangeButton.addEventListener("click", selectStudentRange);
clearSelectionButton.addEventListener("click", () => {
  selectedStudents.clear();
  updateSelectionControls();
  renderList();
  showStatus("Student selection cleared.", "success");
});
templatePicker.addEventListener("change", () => {
  if (selectedIndex >= 0) renderCertificate(students[selectedIndex]);
});
printButton.addEventListener("click", printSelectedStudents);

window.addEventListener("beforeunload", () => {
  for (const url of objectUrls) URL.revokeObjectURL(url);
});

const originalDocumentTitle = document.title;
window.addEventListener("beforeprint", () => {
  document.title = "";
});
window.addEventListener("afterprint", () => {
  document.title = originalDocumentTitle;
  printBatch.replaceChildren();
});

setSchoolHeading();
populateCertificate(
  document.getElementById("certificate"),
  null,
  templatePicker.querySelector('input[name="certificate-template"]:checked').value
);
loadDefaultAssets();
