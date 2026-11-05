interface InputProps {
  value?: string
  onChange?: (value: string) => void
}

export const Input = ({ value, onChange }: InputProps) => {
  function handleChange(event: Any) {
    onChange?.(event.target.value)
  }

  return (
    <input
      className="myform-input"
      value={value}
      placeholder="Enter form password here"
      onChange={handleChange}
    />
  )
}
