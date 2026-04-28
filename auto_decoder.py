from pyais import decode


input_file = "AIS_raw.txt"
output_file = "AIS_decoded.csv"


attrs = "mmsi;lon;lat;status;turn;speed;accuracy;course;heading;second;maneuver;spare_1;raim;radio;msg_type;repeat".split(";")

with open(input_file) as inp:
    with open(output_file, "w") as out:
        out.write(";".join(attrs) + "\n")
        while line := inp.readline():
            line = line.strip()
            try:
                data = decode(line)
            except:
                continue

            string = ""
            for attr in attrs:
                try:
                    string += str(data.__getattribute__(attr)) + ";"
                except:
                    string += ";"
            string = string[:len(string)-1]
            out.write(string + "\n")


