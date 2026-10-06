// Where the sample customers' cars are: fictional streets and 555-01xx phone numbers (a
// range reserved for fiction). Private: only the customer, the mechanic of a confirmed
// booking and an admin (through an audited reveal) can see them.
import type { SampleRequestInput } from "./requests";

type Contact = Pick<SampleRequestInput, "contactPhone" | "streetAddress" | "city" | "state" | "locationNotes">;

export const DANA_HOME: Contact = {
  contactPhone: "480-555-0123",
  streetAddress: "1234 E Lantern Mesa Dr",
  city: "Tempe",
  state: "AZ",
  locationNotes: "Driveway on the left side of the house.",
};

export const DANA_OFFICE: Contact = {
  contactPhone: "480-555-0123",
  streetAddress: "500 S Quartzline Blvd (office parking garage)",
  city: "Tempe",
  state: "AZ",
  locationNotes: "Level 2, near the elevators. Silver Camry.",
};

export const LUIS_HOME: Contact = {
  contactPhone: "623-555-0177",
  streetAddress: "4321 W Cobalt Wash Ln",
  city: "Glendale",
  state: "AZ",
  locationNotes: null,
};

export const LUIS_JOB_SITE: Contact = {
  contactPhone: "623-555-0177",
  streetAddress: "100 W Saltbrush Ranch Rd (job site)",
  city: "Maricopa",
  state: "AZ",
  locationNotes: "White Tacoma parked next to the site trailer.",
};

export const NINA_HOME: Contact = {
  contactPhone: "480-555-0164",
  streetAddress: "7710 E Moonvine Way",
  city: "Scottsdale",
  state: "AZ",
  locationNotes: "Covered parking spot 14, gate code at check-in.",
};

export const OMAR_HOME: Contact = {
  contactPhone: "480-555-0139",
  streetAddress: "2218 E Starling Ridge St",
  city: "Gilbert",
  state: "AZ",
  locationNotes: "RAV4 on the driveway; side gate is unlocked.",
};

export const OMAR_WORK: Contact = {
  contactPhone: "480-555-0139",
  streetAddress: "910 N Kestrel Yard Rd (warehouse lot)",
  city: "Mesa",
  state: "AZ",
  locationNotes: "Blue F-150 by the loading dock.",
};

export const GRACE_HOME: Contact = {
  contactPhone: "602-555-0186",
  streetAddress: "4402 E Orchard Glow Ln",
  city: "Phoenix",
  state: "AZ",
  locationNotes: "Street parking in front of the house is fine.",
};

export const BEN_HOME: Contact = {
  contactPhone: "623-555-0148",
  streetAddress: "8815 W Thornbird Ct",
  city: "Peoria",
  state: "AZ",
  locationNotes: null,
};

export const HANNAH_HOME: Contact = {
  contactPhone: "480-555-0172",
  streetAddress: "3360 S Cedar Spark Ave",
  city: "Chandler",
  state: "AZ",
  locationNotes: "Silver Elantra in the driveway.",
};
