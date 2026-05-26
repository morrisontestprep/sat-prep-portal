// SAT domain → skill taxonomy (College Board defined, stable)
// subject keys match what's stored in the questions table
export const SAT_SKILL_TREE: Record<string, Record<string, string[]>> = {
  math: {
    'Algebra': [
      'Linear equations in one variable',
      'Linear equations in two variables',
      'Linear functions',
      'Systems of two linear equations in two variables',
    ],
    'Advanced Math': [
      'Equivalent expressions',
      'Nonlinear equations in one variable and systems of equations in two variables',
      'Nonlinear functions',
    ],
    'Problem-Solving and Data Analysis': [
      'Inference from statistics and probability',
      'Percentages',
      'Proportional relationships',
      'Ratios, rates, proportional relationships, and units',
      'Statistics and probability',
    ],
    'Geometry and Trigonometry': [
      'Area and volume',
      'Circles',
      'Lines, angles, and triangles',
      'Right triangles and trigonometry',
    ],
  },
  english: {
    'Craft and Structure': [
      'Cross-text connections',
      'Text Structure and Purpose',
      'Words in Context',
    ],
    'Expression of Ideas': [
      'Rhetorical Synthesis',
      'Transitions',
    ],
    'Information and Ideas': [
      'Central Ideas and Details',
      'Command of Evidence (Quantitative)',
      'Command of Evidence (Textual)',
      'Inferences',
    ],
    'Standard English Conventions': [
      'Boundaries',
      'Form, Structure, and Sense',
    ],
  },
}
