meta:
  id: gguf
  title: GGUF (GPT-Generated Unified Format)
  file-extension: gguf
  endian: le
  license: CC0-1.0
  ks-version: 0.9
doc: |
  GGUF is a file format for storing models for inference with GGML and executors based on GGML.
  GGUF is a binary format that is designed for fast loading and saving of models, and for ease of reading.
  
  The format is structured as:
  - Header (magic, version, tensor count, metadata count)
  - Metadata key-value pairs
  - Tensor information (names, dimensions, types, offsets)
  - Alignment padding
  - Tensor data (at the offsets specified in tensor info)
  
  This format supports lazy loading - the metadata and tensor info can be read without
  loading the actual tensor data, which can be gigabytes in size.

seq:
  - id: header
    type: header
    doc: File header containing magic number, version, and counts
  - id: metadata
    type: metadata_entry
    repeat: expr
    repeat-expr: header.metadata_count
    doc: Key-value metadata pairs describing the model
  - id: tensor_info
    type: tensor_info_entry
    repeat: expr
    repeat-expr: header.tensor_count
    doc: Tensor metadata (names, shapes, types, offsets) without actual tensor data

types:
  header:
    doc: GGUF file header
    seq:
      - id: magic
        contents: [0x47, 0x47, 0x55, 0x46]
        doc: Magic number "GGUF" (0x47475546)
      - id: version
        type: u4
        doc: GGUF format version
      - id: tensor_count
        type: u8
        doc: Number of tensors in the file
      - id: metadata_count
        type: u8
        doc: Number of metadata key-value pairs
  
  metadata_entry:
    doc: A single metadata key-value pair
    seq:
      - id: key_length
        type: u8
        doc: Length of the key string
      - id: key
        type: str
        size: key_length
        encoding: UTF-8
        doc: Metadata key name
      - id: value_type
        type: u4
        enum: value_type
        doc: Type of the metadata value
      - id: value
        type:
          switch-on: value_type
          cases:
            'value_type::uint8': value_uint8
            'value_type::int8': value_int8
            'value_type::uint16': value_uint16
            'value_type::int16': value_int16
            'value_type::uint32': value_uint32
            'value_type::int32': value_int32
            'value_type::float32': value_float32
            'value_type::bool': value_bool
            'value_type::string': value_string
            'value_type::array': value_array
            'value_type::uint64': value_uint64
            'value_type::int64': value_int64
            'value_type::float64': value_float64
        doc: The actual metadata value
  
  tensor_info_entry:
    doc: Metadata about a single tensor (not the tensor data itself)
    seq:
      - id: name_length
        type: u8
        doc: Length of the tensor name string
      - id: name
        type: str
        size: name_length
        encoding: UTF-8
        doc: Tensor name (e.g., "blk.0.attn_q.weight")
      - id: n_dimensions
        type: u4
        doc: Number of dimensions in the tensor
      - id: dimensions
        type: u8
        repeat: expr
        repeat-expr: n_dimensions
        doc: Size of each dimension
      - id: tensor_type
        type: u4
        enum: tensor_type
        doc: Data type of the tensor elements
      - id: offset
        type: u8
        doc: Offset from the start of the tensor data section to this tensor's data
    instances:
      element_count:
        value: dimensions.size == 0 ? 0 : dimensions.reduce((acc, dim) => acc * dim, 1)
        doc: Total number of elements in the tensor (product of all dimensions)
  
  # Value type handlers
  value_uint8:
    seq:
      - id: value
        type: u1
  
  value_int8:
    seq:
      - id: value
        type: s1
  
  value_uint16:
    seq:
      - id: value
        type: u2
  
  value_int16:
    seq:
      - id: value
        type: s2
  
  value_uint32:
    seq:
      - id: value
        type: u4
  
  value_int32:
    seq:
      - id: value
        type: s4
  
  value_float32:
    seq:
      - id: value
        type: f4
  
  value_bool:
    seq:
      - id: value
        type: u1
    instances:
      as_bool:
        value: value != 0
  
  value_string:
    seq:
      - id: length
        type: u8
        doc: Length of the string
      - id: value
        type: str
        size: length
        encoding: UTF-8
  
  value_uint64:
    seq:
      - id: value
        type: u8
  
  value_int64:
    seq:
      - id: value
        type: s8
  
  value_float64:
    seq:
      - id: value
        type: f8
  
  value_array:
    seq:
      - id: element_type
        type: u4
        enum: value_type
        doc: Type of elements in the array
      - id: length
        type: u8
        doc: Number of elements in the array
      - id: elements
        type:
          switch-on: element_type
          cases:
            'value_type::uint8': array_uint8
            'value_type::int8': array_int8
            'value_type::uint16': array_uint16
            'value_type::int16': array_int16
            'value_type::uint32': array_uint32
            'value_type::int32': array_int32
            'value_type::float32': array_float32
            'value_type::bool': array_bool
            'value_type::string': array_string
            'value_type::uint64': array_uint64
            'value_type::int64': array_int64
            'value_type::float64': array_float64
        doc: Array elements
  
  # Array type handlers
  array_uint8:
    seq:
      - id: values
        type: u1
        repeat: expr
        repeat-expr: _parent.length
  
  array_int8:
    seq:
      - id: values
        type: s1
        repeat: expr
        repeat-expr: _parent.length
  
  array_uint16:
    seq:
      - id: values
        type: u2
        repeat: expr
        repeat-expr: _parent.length
  
  array_int16:
    seq:
      - id: values
        type: s2
        repeat: expr
        repeat-expr: _parent.length
  
  array_uint32:
    seq:
      - id: values
        type: u4
        repeat: expr
        repeat-expr: _parent.length
  
  array_int32:
    seq:
      - id: values
        type: s4
        repeat: expr
        repeat-expr: _parent.length
  
  array_float32:
    seq:
      - id: values
        type: f4
        repeat: expr
        repeat-expr: _parent.length
  
  array_bool:
    seq:
      - id: values
        type: u1
        repeat: expr
        repeat-expr: _parent.length
  
  array_string:
    seq:
      - id: values
        type: value_string
        repeat: expr
        repeat-expr: _parent.length
  
  array_uint64:
    seq:
      - id: values
        type: u8
        repeat: expr
        repeat-expr: _parent.length
  
  array_int64:
    seq:
      - id: values
        type: s8
        repeat: expr
        repeat-expr: _parent.length
  
  array_float64:
    seq:
      - id: values
        type: f8
        repeat: expr
        repeat-expr: _parent.length

enums:
  value_type:
    0: uint8
    1: int8
    2: uint16
    3: int16
    4: uint32
    5: int32
    6: float32
    7: bool
    8: string
    9: array
    10: uint64
    11: int64
    12: float64
  
  tensor_type:
    0: f32
    1: f16
    2: q4_0
    3: q4_1
    4: q4_2  # removed in GGML
    5: q4_3  # removed in GGML
    6: q5_0
    7: q5_1
    8: q8_0
    9: q8_1
    10: q2_k
    11: q3_k
    12: q4_k
    13: q5_k
    14: q6_k
    15: q8_k
    16: iq2_xxs
    17: iq2_xs
    18: iq3_xxs
    19: iq1_s
    20: iq4_nl
    21: iq3_s
    22: iq2_s
    23: iq4_xs
    24: i8
    25: i16
    26: i32
    27: i64
    28: f64
    29: iq1_m
    30: bf16
    31: q4_0_4_4
    32: q4_0_4_8
    33: q4_0_8_8

instances:
  alignment:
    value: 32
    doc: Default alignment for tensor data (can be overridden by metadata "general.alignment")
  
  metadata_size:
    value: |
      metadata.map(m => {
        let size = 8 + m.key_length + 4; // key_length + key + value_type
        // Add value size based on type
        return size;
      }).reduce((a, b) => a + b, 0)
    doc: Total size of all metadata entries (for calculating tensor data offset)
  
  tensor_info_size:
    value: |
      tensor_info.map(t => 8 + t.name_length + 4 + (t.n_dimensions * 8) + 4 + 8)
        .reduce((a, b) => a + b, 0)
    doc: Total size of all tensor info entries
  
  header_and_metadata_end:
    value: 20 + metadata_size + tensor_info_size
    doc: |
      Byte offset where header + metadata + tensor_info ends.
      This is the unaligned offset before tensor data begins.
      
      Calculation: 
        4 (magic) + 4 (version) + 8 (tensor_count) + 8 (metadata_count) = 20 bytes header
        + metadata_size
        + tensor_info_size
